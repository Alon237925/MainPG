"""操作答疑智能体的业务编排：FAQ 检索 + 未命中记录。

设计边界（重要）：

* **纯本地检索，不调用任何 AI 模型。** 所有答案都来自 ``data/faqs.json``。
* **不做用户行为记录。** 未命中清单只存问题文本与出现次数，
  表结构刻意不含 workspace_id / owner_user_id，详见 ``migrations/001_help_agent.sql``。
"""

from __future__ import annotations

import json
import sqlite3
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from . import matcher

#: 未命中记录的保留期（天）。超过的自动清理，避免本地库无限增长。
MISSED_RETENTION_DAYS = 90

#: 单次提问的字符上限，防止超长文本拖慢匹配并污染未命中清单
MAX_QUESTION_CHARS = 500


@dataclass(frozen=True)
class FaqLibrary:
    """已加载的 FAQ 库。"""

    faqs: list[dict[str, Any]]
    synonyms: dict[str, list[str]]
    version: int


def faq_data_path() -> Path:
    """定位 FAQ 数据文件，兼容源码运行与 PyInstaller 打包运行。

    优先级：打包资源（spec datas 打进 _internal）> 源码相对路径。
    与 ``app/main.py`` 的 ``_frontend_dist_dir()`` 保持同一套打包兼容思路。
    """
    relative = Path("wh_local") / "modules" / "help_agent" / "data" / "faqs.json"

    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            bundled = Path(meipass) / relative
            if bundled.is_file():
                return bundled
        beside_exe = Path(sys.executable).resolve().parent / relative
        if beside_exe.is_file():
            return beside_exe

    # 源码运行：本文件位于 wh_local/modules/help_agent/service.py
    return Path(__file__).resolve().parent / "data" / "faqs.json"


class HelpAgentService:
    """操作答疑服务。"""

    def __init__(self, database_path: Path | str) -> None:
        self._db_path = Path(database_path)
        self._library: FaqLibrary | None = None

    # -- FAQ 库 ------------------------------------------------------------

    def library(self) -> FaqLibrary:
        """加载并缓存 FAQ 库（首次访问时读盘）。"""
        if self._library is None:
            self._library = self._load_library()
        return self._library

    def reload_library(self) -> FaqLibrary:
        """强制重新加载（FAQ 更新后可由接口触发）。"""
        self._library = None
        return self.library()

    def _load_library(self) -> FaqLibrary:
        path = faq_data_path()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            # 数据文件缺失不应让整个服务起不来，退化为空库（全部走反馈兜底）
            return FaqLibrary(faqs=[], synonyms={}, version=0)
        except json.JSONDecodeError:
            return FaqLibrary(faqs=[], synonyms={}, version=0)

        faqs = [f for f in (payload.get("faqs") or []) if isinstance(f, dict)]
        synonyms = {
            str(key): [str(v) for v in (values or [])]
            for key, values in (payload.get("synonyms") or {}).items()
        }
        return FaqLibrary(
            faqs=faqs,
            synonyms=synonyms,
            version=int(payload.get("version") or 0),
        )

    # -- 检索 --------------------------------------------------------------

    def search(self, question: str, *, record_miss: bool = True) -> dict[str, Any]:
        """检索 FAQ。

        返回给前端的结构：

        * 命中：``{"type": "hit", "answer": ..., "faq_id": ..., "question": ...}``
        * 候选：``{"type": "candidates", "candidates": [{"faq_id", "question"}]}``
          —— **不含答案**，用户点选后走 :meth:`confirm`
        * 兜底：``{"type": "fallback"}`` —— 前端引导去反馈
        """
        text = str(question or "").strip()[:MAX_QUESTION_CHARS]
        library = self.library()
        result = matcher.search(text, library.faqs, library.synonyms)

        if result.hit is not None:
            return {
                "type": "hit",
                "faq_id": result.hit.faq_id,
                "question": result.hit.question,
                "answer": result.hit.answer,
                "category": result.hit.category,
                "matched_layer": result.matched_layer,
            }

        if result.candidates:
            return {
                "type": "candidates",
                "candidates": [
                    {
                        "faq_id": candidate.faq_id,
                        "question": candidate.question,
                        "category": candidate.category,
                    }
                    for candidate in result.candidates
                ],
                "matched_layer": result.matched_layer,
            }

        # 兜底：记录未命中的问题（不含任何用户身份信息）
        if record_miss and text:
            self.record_miss(text)
        return {"type": "fallback", "matched_layer": result.matched_layer}

    def confirm(self, faq_id: str) -> dict[str, Any] | None:
        """用户点选候选后取答案。"""
        library = self.library()
        faq = matcher.find_by_id(faq_id, library.faqs)
        if faq is None:
            return None
        return {
            "faq_id": str(faq.get("id", "")),
            "question": str(faq.get("question", "")),
            "answer": str(faq.get("answer", "")),
            "category": str(faq.get("category", "")),
        }

    # -- 未命中清单 --------------------------------------------------------

    def record_miss(self, question: str) -> None:
        """记录一条未命中的问题；相同问题累加 hits 而非新增行。

        ⚠️ **不写入任何用户身份信息**。只存归一化后的问题文本 + 最近一次原始问法。
        """
        normalized = matcher.normalize(question)
        if not normalized:
            return
        raw = str(question or "").strip()[:MAX_QUESTION_CHARS]

        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id, hits FROM help_agent_missed_questions WHERE question = ?",
                (normalized,),
            ).fetchone()

            if existing is None:
                conn.execute(
                    """
                    INSERT INTO help_agent_missed_questions
                        (id, question, raw_sample, hits, first_seen, last_seen)
                    VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
                    """,
                    (uuid.uuid4().hex, normalized, raw),
                )
            else:
                conn.execute(
                    """
                    UPDATE help_agent_missed_questions
                       SET hits = hits + 1,
                           raw_sample = ?,
                           last_seen = datetime('now')
                     WHERE question = ?
                    """,
                    (raw, normalized),
                )
            conn.commit()

    def list_missed(self, *, limit: int = 100) -> list[dict[str, Any]]:
        """按热度列出未命中问题（供维护者查库/接口查看）。"""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT question, raw_sample, hits, first_seen, last_seen
                  FROM help_agent_missed_questions
                 ORDER BY hits DESC, last_seen DESC
                 LIMIT ?
                """,
                (max(1, int(limit)),),
            ).fetchall()
        return [dict(row) for row in rows]

    def clear_missed(self) -> int:
        """清空未命中清单，返回删除条数。"""
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM help_agent_missed_questions")
            conn.commit()
            return int(cursor.rowcount or 0)

    def purge_expired(self, *, retention_days: int = MISSED_RETENTION_DAYS) -> int:
        """清理超过保留期的未命中记录，返回删除条数。"""
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=max(1, retention_days))
        ).strftime("%Y-%m-%d %H:%M:%S")
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM help_agent_missed_questions WHERE last_seen < ?",
                (cutoff,),
            )
            conn.commit()
            return int(cursor.rowcount or 0)

    # -- 内部 --------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        return conn
