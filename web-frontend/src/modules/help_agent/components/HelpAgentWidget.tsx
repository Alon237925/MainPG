import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import {
  categoryLabel,
  helpAgentApi,
  type HelpAgentCandidate,
} from "../api/helpAgentApi";
import {
  clampBallPosition,
  isDrag,
  isValidStoredPosition,
  toAssistantMessage,
  type ChatMessage,
} from "../data/chatMessage";
import "../styles/helpAgent.css";

const DRAG_THRESHOLD_PX = 4;
const BALL_SIZE = 56;
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 520;
const PANEL_MARGIN = 16;
const POSITION_STORAGE_KEY = "help_agent_ball_pos";

type BallPosition = { x: number; y: number };

type HelpAgentWidgetProps = {
  /**
   * 是否提供「去提交问题反馈」入口。
   *
   * 反馈面板在「个人中心」里，未登录（注册/登录页）点不到，所以在登录前挂载这个
   * 组件时要传 ``false``，兜底时改成提示「登录后去哪反馈」，不给一个点了没反应的按钮。
   */
  allowFeedback?: boolean;
};

function readStoredPosition(): BallPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidStoredPosition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 默认位置：右下角，和「返回顶部」按钮错开一点。 */
function defaultPosition(): BallPosition {
  return {
    x: window.innerWidth - BALL_SIZE - 24,
    y: window.innerHeight - BALL_SIZE - 96,
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 单轴夹取：把 value 限制在 [min(下限), 上限] 之间；上限小于下限时取下限。 */
function clampAxis(value: number, max: number, min: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function HelpAgentWidget({ allowFeedback = true }: HelpAgentWidgetProps = {}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<BallPosition>(() => readStoredPosition() ?? defaultPosition());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  /** 最近一条答不上来的问题，用于预填反馈内容 */
  const [lastUnanswered, setLastUnanswered] = useState("");

  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 窗口缩放时把悬浮球拉回可视区，避免缩小窗口后球跑出屏幕找不回来。
  useEffect(() => {
    const onResize = () => {
      setPosition((current) =>
        clampBallPosition(current, { width: window.innerWidth, height: window.innerHeight }, BALL_SIZE),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 新消息到达时滚到底部。
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [messages, pending, open]);

  // 打开面板时聚焦输入框，Esc 收起。
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const persistPosition = useCallback((next: BallPosition) => {
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage 不可用时静默忽略，位置只在本次会话生效 */
    }
  }, []);

  // -- 悬浮球拖拽 --------------------------------------------------------

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [position.x, position.y]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && !isDrag({ dx, dy }, DRAG_THRESHOLD_PX)) return;
    drag.moved = true;
    setPosition(clampBallPosition(
      { x: drag.originX + dx, y: drag.originY + dy },
      { width: window.innerWidth, height: window.innerHeight },
      BALL_SIZE,
    ));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag) return;
    if (drag.moved) {
      // 拖过就不算点击，避免拖完手一松误开面板。
      persistPosition(position);
      return;
    }
    setOpen((value) => !value);
  }, [persistPosition, position]);

  // -- 问答 --------------------------------------------------------------

  const pushMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const runSearch = useCallback(async (question: string) => {
    setPending(true);
    setError("");
    try {
      const result = await helpAgentApi.search(question);
      // 兜底时记下原问题，供「去提交问题反馈」预填，省得用户重打一遍。
      if (result.type === "fallback") setLastUnanswered(question);
      pushMessage(toAssistantMessage(result, makeId("a"), question, { allowFeedback }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "查询失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }, [allowFeedback, pushMessage]);

  const handleSubmit = useCallback(async () => {
    const question = draft.trim();
    if (!question || pending) return;
    pushMessage({ id: makeId("u"), role: "user", text: question });
    setDraft("");
    await runSearch(question);
  }, [draft, pending, pushMessage, runSearch]);

  const handlePickCandidate = useCallback(async (candidate: HelpAgentCandidate) => {
    pushMessage({ id: makeId("u"), role: "user", text: candidate.question });
    setPending(true);
    setError("");
    try {
      const answer = await helpAgentApi.confirm(candidate.faq_id);
      pushMessage({
        id: makeId("a"),
        role: "assistant",
        text: answer.answer,
        category: answer.category,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取答案失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }, [pushMessage]);

  const openFeedback = useCallback((question: string) => {
    // 跳到个人中心的意见反馈面板，并把答不上来的问题原文带过去预填。
    window.dispatchEvent(new CustomEvent("mainpg:open-feedback", { detail: { question } }));
    setOpen(false);
  }, []);

  // -- 渲染 --------------------------------------------------------------

  // 面板尽量贴在悬浮球旁边；靠边时夹回可视区，避免超出屏幕。
  const panelStyle: CSSProperties = {
    left: clampAxis(position.x + BALL_SIZE - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN, PANEL_MARGIN),
    top: clampAxis(position.y - PANEL_HEIGHT - 12, window.innerHeight - PANEL_HEIGHT - PANEL_MARGIN, PANEL_MARGIN),
  };

  return (
    <>
      {open && (
        <section className="help-agent-panel" style={panelStyle} role="dialog" aria-modal="false" aria-label="操作答疑">
          <header className="help-agent-panel-head">
            <div>
              <h2>操作答疑</h2>
              <p>系统操作、业务流程都能问</p>
            </div>
            <button type="button" className="help-agent-close" onClick={() => setOpen(false)} aria-label="收起答疑">×</button>
          </header>

          <div className="help-agent-body" ref={bodyRef}>
            {messages.length === 0 && !pending && (
              <div className="help-agent-empty">
                <p>你好，遇到操作问题直接问我就行。</p>
                <div className="help-agent-samples">
                  {SAMPLE_QUESTIONS.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      className="help-agent-sample"
                      onClick={() => {
                        pushMessage({ id: makeId("u"), role: "user", text: sample });
                        void runSearch(sample);
                      }}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`help-agent-msg is-${message.role}`}>
                <div className="help-agent-bubble">
                  {message.category && <span className="help-agent-tag">{categoryLabel(message.category)}</span>}
                  <p className="help-agent-text">{message.text}</p>
                  {message.candidates && message.candidates.length > 0 && (
                    <ul className="help-agent-candidates">
                      {message.candidates.map((candidate) => (
                        <li key={candidate.faq_id}>
                          <button type="button" onClick={() => void handlePickCandidate(candidate)} disabled={pending}>
                            {/* 候选都长得像，带上分类用户才能一眼选出对的那条 */}
                            {candidate.category && (
                              <span className="help-agent-candidate-tag">{categoryLabel(candidate.category)}</span>
                            )}
                            <span className="help-agent-candidate-text">{candidate.question}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {message.fallback && allowFeedback && (
                    <button
                      type="button"
                      className="help-agent-feedback-btn"
                      onClick={() => openFeedback(message.sourceQuestion ?? lastUnanswered)}
                    >
                      去提交问题反馈
                    </button>
                  )}
                </div>
              </div>
            ))}

            {pending && (
              <div className="help-agent-msg is-assistant">
                <div className="help-agent-bubble is-typing"><span /><span /><span /></div>
              </div>
            )}
          </div>

          <footer className="help-agent-foot">
            {error && <p className="help-agent-error">{error}</p>}
            <div className="help-agent-input-row">
              <textarea
                ref={inputRef}
                className="help-agent-input"
                rows={1}
                maxLength={500}
                placeholder="描述你的问题，例如「POD定制怎么使用」"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
              <button
                type="button"
                className="help-agent-send"
                onClick={() => void handleSubmit()}
                disabled={pending || !draft.trim()}
              >
                发送
              </button>
            </div>
            <p className="help-agent-hint">答案来自常见问题库，无需联网、不消耗积分</p>
          </footer>
        </section>
      )}

      <button
        type="button"
        className={`help-agent-ball${open ? " is-open" : ""}`}
        style={{ left: position.x, top: position.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={open ? "收起操作答疑" : "打开操作答疑"}
        title="操作答疑（可拖动）"
      >
        <span aria-hidden="true">{open ? "×" : "?"}</span>
      </button>
    </>
  );
}

const SAMPLE_QUESTIONS = [
  "POD定制怎么使用？",
  "积分是怎么扣的",
  "怎么采集商品？",
  "处理完怎么导出到店小秘",
];
