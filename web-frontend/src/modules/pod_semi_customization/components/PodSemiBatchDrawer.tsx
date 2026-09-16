import { useEffect } from "react";
import { createPortal } from "react-dom";

import { semiBatchStatusLabel } from "../data/podSemiCustomizationModel";
import type { SemiBatchSummary } from "../types";

type Props = {
  open: boolean;
  batches: SemiBatchSummary[];
  activeBatchId?: string;
  loading: boolean;
  onOpen: (batchId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
};

/**
 * 半定制的批次记录抽屉：与全定制页的定制记录历史同一套抽屉外壳与列表样式
 * （复用 pod-history* 类名），把原来占在结果列顶部的「批次」卡片收到次级顶栏入口后面。
 * 半定制没有标题/导出记录，所以列表只展示款进度，不提供勾选删除。
 */
export function PodSemiBatchDrawer({
  open,
  batches,
  activeBatchId,
  loading,
  onOpen,
  onRefresh,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  // portal 到 body：workspace-tab-panel 的 fill-mode 入场动画创建层叠上下文，
  // 会把 fixed 抽屉的 z-index 锁在面板内、被 sticky 顶栏盖住头部。
  return createPortal(
    <div className="pod-history-drawer-layer">
      <button type="button" className="pod-history-drawer-backdrop" onClick={onClose} aria-label="关闭批次记录" />
      <aside className="pod-history-drawer" role="dialog" aria-modal="true" aria-label="批次记录">
        <header className="pod-history-drawer-header">
          <div>
            <span>BATCH HISTORY</span>
            <h2>批次记录</h2>
            <p>点击任一批次切换到对应视图。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="pod-history-drawer-body">
          <section className="pod-history" aria-label="半定制批次记录">
            <header>
              <div><span>BATCH HISTORY</span><h3>最近批次</h3></div>
              <div className="pod-history-header-actions">
                <button type="button" onClick={onRefresh} disabled={loading} aria-label="刷新批次记录">
                  <span className={`iconfont icon-sync ${loading ? "is-spinning" : ""}`} />
                </button>
              </div>
            </header>
            <div className="pod-history-list">
              {batches.map((batch) => {
                const settled = batch.item_count ? Math.round((batch.completed_item_count / batch.item_count) * 100) : 0;
                return (
                  <div key={batch.id} className={`pod-history-item ${activeBatchId === batch.id ? "is-active" : ""}`}>
                    <button type="button" className="pod-history-open" onClick={() => onOpen(batch.id)}>
                      <span className="pod-history-primary">
                        <b>{batch.title || batch.id}</b>
                        <small>{semiBatchStatusLabel(batch.status)}</small>
                      </span>
                      <span className="pod-history-progress">
                        <i><span style={{ width: `${settled}%` }} /></i>
                        <small>{batch.completed_item_count}/{batch.item_count}</small>
                      </span>
                      <time dateTime={batch.created_at}>
                        {new Date(batch.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </button>
                  </div>
                );
              })}
              {!loading && !batches.length && <p>暂无批次；发起第一个半定制批次后在此查看。</p>}
              {loading && !batches.length && <p>正在读取批次记录…</p>}
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
