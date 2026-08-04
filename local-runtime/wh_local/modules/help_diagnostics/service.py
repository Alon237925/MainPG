from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ...db import connect
from .content import MANUAL_CHAPTERS, MANUAL_TITLE, MANUAL_VERSION, MODULE_STATUSES
from .schemas import (
    DiagnosticCheck,
    DiagnosticsResponse,
    HelpStatusResponse,
    ManualChapter,
    ManualChapterSummary,
    ManualResponse,
    ModuleStatus,
)


@dataclass
class HelpDiagnosticsService:
    database_path: Path

    def manual(self) -> ManualResponse:
        return ManualResponse(
            title=MANUAL_TITLE,
            version=MANUAL_VERSION,
            chapters=[ManualChapter.model_validate(item) for item in sorted(MANUAL_CHAPTERS, key=lambda row: row["order"])],
        )

    def chapter_summaries(self) -> list[ManualChapterSummary]:
        return [
            ManualChapterSummary.model_validate(item)
            for item in sorted(MANUAL_CHAPTERS, key=lambda row: row["order"])
        ]

    def chapter(self, chapter_id: str) -> ManualChapter | None:
        for item in MANUAL_CHAPTERS:
            if item["id"] == chapter_id:
                return ManualChapter.model_validate(item)
        return None

    def status(self) -> HelpStatusResponse:
        return HelpStatusResponse(modules=self._module_statuses())

    def diagnostics(self) -> DiagnosticsResponse:
        return DiagnosticsResponse(
            runtime={
                "app": "H Smart Ecommerce Local Runtime",
                "manual_version": MANUAL_VERSION,
                "database_path": str(self.database_path),
            },
            modules=self._module_statuses(),
            checks=self._checks(),
        )

    def _module_statuses(self) -> list[ModuleStatus]:
        return [ModuleStatus.model_validate(item) for item in MODULE_STATUSES]

    def _checks(self) -> list[DiagnosticCheck]:
        checks = [self._database_check()]
        mounted_count = sum(1 for item in MODULE_STATUSES if item.get("mounted"))
        checks.append(
            DiagnosticCheck(
                id="mounted-modules",
                label="已挂载模块",
                status="ok" if mounted_count else "warn",
                message=f"当前主应用已挂载 {mounted_count} 个业务/帮助模块。",
            )
        )
        checks.append(
            DiagnosticCheck(
                id="manual-content",
                label="使用手册内容",
                status="ok",
                message=f"当前静态手册共 {len(MANUAL_CHAPTERS)} 个章节。",
            )
        )
        return checks

    def _database_check(self) -> DiagnosticCheck:
        try:
            with connect(self.database_path) as conn:
                conn.execute("SELECT 1").fetchone()
        except Exception as exc:
            return DiagnosticCheck(
                id="database",
                label="本地数据库",
                status="error",
                message=f"SQLite 不可访问：{exc}",
            )
        return DiagnosticCheck(
            id="database",
            label="本地数据库",
            status="ok",
            message="SQLite 可访问。",
        )
