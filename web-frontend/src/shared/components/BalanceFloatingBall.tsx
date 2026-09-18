import { useCallback, useEffect, useRef, useState } from "react";

import { loadBillingSummary } from "../../modules/personal_center/api/personalCenterApi";
import { BALANCE_CHANGED_EVENT } from "../balanceEvents";
import { useTheme, type ThemeId } from "../hooks/useTheme";
import "./balanceBall.css";

/** 各主题专属 Q 版吉祥物（翻转球背面图）。lime/starry 主题尚未启用，资产已备好。 */
const THEME_MASCOT: Record<ThemeId, string> = {
  classic: "/theme/mascots/01-classic.png",
  sunset: "/theme/mascots/02-warm-orange.png",
  violet: "/theme/mascots/03-sakura-purple.png",
  dessert: "/theme/mascots/04-caramel.png",
  diamond: "/theme/mascots/05-diamond.png",
  quirky: "/theme/mascots/06-sticker.png",
  chinese: "/theme/mascots/07-ink.png",
  peach: "/theme/mascots/08-peach.png",
};

const POSITION_KEY = "mainpg.balanceBall.position";
const DRAG_THRESHOLD_PX = 6;
/** 无任何交互时，每隔 30 分钟自动翻面展示一次吉祥物（彩蛋）。 */
const IDLE_FLIP_INTERVAL_MS = 30 * 60 * 1000;
/** 自动展示时图面停留时长，之后翻回数字面。 */
const AUTO_SHOW_MS = 5000;
const POLL_INTERVAL_MS = 60_000;
const BALL_SIZE = 80;

type BallPosition = { x: number; y: number };

function readPosition(): BallPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BallPosition> | null;
    if (parsed && typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch { /* ignore */ }
  return null;
}

function clampPosition(position: BallPosition): BallPosition {
  const margin = 8;
  return {
    x: Math.min(Math.max(position.x, margin), window.innerWidth - BALL_SIZE - margin),
    y: Math.min(Math.max(position.y, margin), window.innerHeight - BALL_SIZE - margin),
  };
}

function defaultPosition(): BallPosition {
  return clampPosition({
    x: 24,
    y: window.innerHeight - BALL_SIZE - 24,
  });
}

/** 悬浮翻转球：余额面朝外随时可见，点击翻到主题吉祥物面，3 秒自动翻回，可拖动。 */
export function BalanceFloatingBall() {
  const { theme } = useTheme();
  const [points, setPoints] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [position, setPosition] = useState<BallPosition>(() => {
    const saved = readPosition();
    return saved ? clampPosition(saved) : defaultPosition();
  });
  const flipTimerRef = useRef<number | null>(null);
  const autoShowTimerRef = useRef<number | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const refresh = useCallback(async () => {
    try {
      const payload = await loadBillingSummary();
      setPoints(payload.wallet.available_points);
    } catch {
      // 静默失败：保留旧值，等下一轮刷新
    }
  }, []);

  // 空闲翻转计时：无任何交互满 30 分钟，自动翻到图面展示 5 秒再翻回。
  const scheduleIdleFlip = useCallback(() => {
    if (flipTimerRef.current != null) window.clearTimeout(flipTimerRef.current);
    flipTimerRef.current = window.setTimeout(() => {
      flipTimerRef.current = null;
      setFlipped(true);
      if (autoShowTimerRef.current != null) window.clearTimeout(autoShowTimerRef.current);
      autoShowTimerRef.current = window.setTimeout(() => {
        setFlipped(false);
        autoShowTimerRef.current = null;
        scheduleIdleFlip();
      }, AUTO_SHOW_MS);
    }, IDLE_FLIP_INTERVAL_MS);
  }, []);

  useEffect(() => {
    scheduleIdleFlip();
    return () => {
      if (flipTimerRef.current != null) window.clearTimeout(flipTimerRef.current);
      if (autoShowTimerRef.current != null) window.clearTimeout(autoShowTimerRef.current);
    };
  }, [scheduleIdleFlip]);

  useEffect(() => {
    void refresh();
    const onChanged = () => { void refresh(); };
    window.addEventListener(BALANCE_CHANGED_EVENT, onChanged);
    const pollTimer = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    const onResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener(BALANCE_CHANGED_EVENT, onChanged);
      window.clearInterval(pollTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [refresh]);

  // 手动点击：纯切换（不自动翻回），并重置 30 分钟空闲计时。
  const flip = useCallback(() => {
    setFlipped((current) => !current);
    if (autoShowTimerRef.current != null) {
      window.clearTimeout(autoShowTimerRef.current);
      autoShowTimerRef.current = null;
    }
    scheduleIdleFlip();
  }, [scheduleIdleFlip]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragRef.current.moved = true;
    setPosition(clampPosition({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    }));
  };

  const onPointerUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (dragRef.current.moved) {
      try {
        window.localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current));
      } catch { /* ignore */ }
      scheduleIdleFlip(); // 拖动也算交互，重置空闲计时
    } else {
      flip();
    }
  };

  const mascot = THEME_MASCOT[theme] ?? THEME_MASCOT.classic;
  const displayPoints = points == null ? "…" : String(points);

  return (
    <div
      className={`balance-ball${flipped ? " is-flipped" : ""}`}
      style={{ left: position.x, top: position.y }}
      role="button"
      tabIndex={0}
      aria-label={`可用积分 ${points == null ? "加载中" : points}`}
      title={points == null ? "积分加载中" : `可用积分 ${points}，点击查看今日伙伴`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="balance-ball-inner">
        <div className="balance-ball-face is-front">
          <span className="balance-ball-label">积分</span>
          <b className={displayPoints.length >= 6 ? "is-compact" : undefined}>{displayPoints}</b>
        </div>
        <div className="balance-ball-face is-back">
          <img src={mascot} alt="主题伙伴" draggable={false} />
        </div>
      </div>
    </div>
  );
}
