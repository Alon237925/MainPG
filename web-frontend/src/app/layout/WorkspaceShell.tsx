import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  isWorkspaceNavigationGroup,
  workspaceModules,
  workspacePageModules,
  type WorkspaceModule,
  type WorkspaceModuleId,
  type WorkspaceNavigationGroup,
  type WorkspaceNavigationGroupId,
  type WorkspaceNavigationItem,
} from "../navigation/modules";
import { Sidebar } from "./Sidebar";
import { TopNavigation, type WorkspaceTab } from "./TopNavigation";
import { PeachGarden } from "../../shared/components/PeachGarden";
import { InkTap } from "../../shared/components/InkTap";
import { useTheme } from "../../shared/hooks/useTheme";
import { useUiMode } from "../../shared/hooks/useUiMode";
import { WorkspaceHomePage } from "../../modules/dashboard/pages/WorkspaceHomePage";
import {
  importPreviewItem,
  listDimensionNotifications,
  markDimensionNotificationRead,
} from "../../modules/product_processing/api/dimensionCanvasApi";

// 页面组件按需懒加载（路由级代码分割，缩小首屏 bundle）。
// dashboard 是默认首屏 tab，保持同步加载，避免首屏出现加载闪烁。
const DailySelectionPage = lazy(() => import("../../modules/daily_selection/pages/DailySelectionPage").then((m) => ({ default: m.DailySelectionPage })));
const ProfitActivityProductsPage = lazy(() => import("../../modules/profit_activity/pages/ProfitActivityProductsPage").then((m) => ({ default: m.ProfitActivityProductsPage })));
const ProfitActivityTestPage = lazy(() => import("../../modules/profit_activity/pages/ProfitActivityTestPage").then((m) => ({ default: m.ProfitActivityTestPage })));
const PriceVerificationPage = lazy(() => import("../../modules/price_verification/pages/PriceVerificationPage").then((m) => ({ default: m.PriceVerificationPage })));
const ProductProcessingVerifyPage = lazy(() => import("../../modules/product_processing/pages/ProductProcessingVerifyPage").then((m) => ({ default: m.ProductProcessingVerifyPage })));
const ProductProcessingTaskPage = lazy(() => import("../../modules/product_processing/pages/ProductProcessingTaskPage").then((m) => ({ default: m.ProductProcessingTaskPage })));
const ProductProcessingHistoryPage = lazy(() => import("../../modules/product_processing/pages/ProductProcessingHistoryPage").then((m) => ({ default: m.ProductProcessingHistoryPage })));
const ProductProcessingPrecheckPage = lazy(() => import("../../modules/product_processing/pages/ProductProcessingPrecheckPage").then((m) => ({ default: m.ProductProcessingPrecheckPage })));
const ComboKitPage = lazy(() => import("../../modules/combo_kit/pages/ComboKitPage").then((m) => ({ default: m.ComboKitPage })));
const ComboKitPromptPresetPage = lazy(() => import("../../modules/combo_kit/pages/ComboKitPromptPresetPage").then((m) => ({ default: m.ComboKitPromptPresetPage })));
const ComboKitHistoryPage = lazy(() => import("../../modules/combo_kit/pages/ComboKitHistoryPage").then((m) => ({ default: m.ComboKitHistoryPage })));
const DimensionCanvasPage = lazy(() => import("../../modules/product_processing/pages/DimensionCanvasPage").then((m) => ({ default: m.DimensionCanvasPage })));
const PodCustomizationPage = lazy(() => import("../../modules/pod_customization/pages/PodCustomizationPage").then((m) => ({ default: m.PodCustomizationPage })));
const PersonalCenterPage = lazy(() => import("../../modules/personal_center/pages/PersonalCenterPage").then((m) => ({ default: m.PersonalCenterPage })));
import type { ProductProcessingOptions } from "../../modules/product_processing/types";
import type { DimensionCanvasItem, DimensionNotification } from "../../modules/product_processing/types/dimensionCanvas";
import { DimensionNotificationRefreshFence } from "../../modules/product_processing/data/dimensionNotificationRefresh";
import { EmptyModulePage } from "../../shared/components/EmptyModulePage";
import { BrandEntryAnimation } from "../../shared/components/BrandEntryAnimation";
import { WorkspaceTabScrollStore } from "./workspaceTabState";

type WorkspaceShellProps = {
  currentRole?: string;
  onSignOut: () => void;
  playEntryAnimation?: boolean;
  onEntryAnimationComplete?: () => void;
};

const MAX_COLLECTION_PANELS = 6;
const MAX_PROCESSING_PANELS = 3;
const NARROW_DESKTOP_QUERY = "(min-width: 801px) and (max-width: 1100px)";

function isAdminRole(role: string | undefined): boolean {
  const normalized = (role ?? "operator").toLowerCase();
  return normalized === "admin" || normalized === "owner";
}

/** 按角色过滤 adminOnly 模块；非 admin 只保留普通模块与包含可见子项的分组。 */
function filterModulesForRole(items: WorkspaceNavigationItem[], isAdmin: boolean): WorkspaceNavigationItem[] {
  if (isAdmin) return items;
  const visible: WorkspaceNavigationItem[] = [];
  for (const item of items) {
    if (isWorkspaceNavigationGroup(item)) {
      const children = item.children.filter((child) => !child.adminOnly);
      if (children.length) visible.push({ ...item, children });
    } else if (!item.adminOnly) {
      visible.push(item);
    }
  }
  return visible;
}

function navigationGroupForModule(id: WorkspaceModuleId, groups: WorkspaceNavigationGroup[]) {
  return groups.find((group) => group.children.some((child) => child.id === id));
}

function moduleTab(id: WorkspaceModuleId, flatModules: WorkspaceModule[]): WorkspaceTab {
  const module = flatModules.find((item) => item.id === id)!;
  return { key: id, moduleId: id, label: module.label, icon: module.icon, iconClass: module.iconClass };
}

/** 懒加载模块的加载占位：轻量骨架，避免切换模块时出现空白闪烁。 */
function ModuleFallback() {
  return (
    <div className="workspace-module-fallback" role="status" aria-label="模块加载中">
      <span className="workspace-module-fallback-spinner" aria-hidden="true" />
      <span>正在加载模块…</span>
    </div>
  );
}

export function WorkspaceShell({ currentRole = "operator", onSignOut, playEntryAnimation = false, onEntryAnimationComplete = () => undefined }: WorkspaceShellProps) {
  const { theme } = useTheme();
  const { uiMode } = useUiMode();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [isNarrowDesktop, setIsNarrowDesktop] = useState(() => window.matchMedia(NARROW_DESKTOP_QUERY).matches);
  const [expandedGroupId, setExpandedGroupId] = useState<WorkspaceNavigationGroupId | null>(null);
  const [activeTabKey, setActiveTabKey] = useState("dashboard");
  const [tabs, setTabs] = useState<WorkspaceTab[]>([moduleTab("dashboard", workspacePageModules)]);
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [dimensionNotifications, setDimensionNotifications] = useState<DimensionNotification[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const collectionSequence = useRef(0);
  const processingSequence = useRef(0);
  const precheckSequence = useRef(0);
  const dimensionOpenRequests = useRef(new Map<string, Promise<DimensionCanvasItem>>());
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new WorkspaceTabScrollStore());
  // 最新 tabs 的镜像：供异步回调（await 之后）与同步判断读取最新值，
  // 避免使用已过期的渲染闭包 tabs 导致激活/去重/上限判定失准。
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const isAdmin = isAdminRole(currentRole);
  const visibleModules = useMemo(() => filterModulesForRole(workspaceModules, isAdmin), [isAdmin]);
  const flatModules = useMemo(() => filterModulesForRole(workspacePageModules, isAdmin) as WorkspaceModule[], [isAdmin]);
  const navigationGroups = useMemo(() => visibleModules.filter(isWorkspaceNavigationGroup), [visibleModules]);
  const modulesById = useMemo(() => new Map(flatModules.map((module) => [module.id, module])), [flatModules]);
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];
  const activeModuleId = activeTab?.moduleId ?? "dashboard";

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_DESKTOP_QUERY);
    const updateNarrowDesktop = () => setIsNarrowDesktop(mediaQuery.matches);
    updateNarrowDesktop();
    mediaQuery.addEventListener("change", updateNarrowDesktop);
    return () => mediaQuery.removeEventListener("change", updateNarrowDesktop);
  }, []);

  useEffect(() => {
    const content = contentRef.current;

    const updateVisibility = () => {
      const documentHeight = document.documentElement.scrollHeight;
      const windowScrollableDistance = Math.max(documentHeight - window.innerHeight, 0);
      const windowScrollProgress = windowScrollableDistance > 0
        ? window.scrollY / windowScrollableDistance
        : 0;

      const contentScrollableDistance = content
        ? Math.max(content.scrollHeight - content.clientHeight, 0)
        : 0;
      const contentScrollProgress = content && contentScrollableDistance > 0
        ? content.scrollTop / contentScrollableDistance
        : 0;

      setShowScrollTop(windowScrollProgress >= 0.25 || contentScrollProgress >= 0.25);
    };

    window.addEventListener("scroll", updateVisibility, { passive: true });
    content?.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    updateVisibility();

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      content?.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  useEffect(() => {
    setShowScrollTop(false);
  }, [activeTabKey]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let abortController: AbortController | null = null;
    const fence = new DimensionNotificationRefreshFence<DimensionNotification[]>();

    const refresh = () => {
      if (stopped) return;
      const generation = fence.begin();
      if (generation == null) return;
      const controller = new AbortController();
      abortController = controller;
      listDimensionNotifications("", controller.signal)
        .then((items) => {
          fence.succeed(generation, items, (fresh) => {
            if (!stopped) {
              setDimensionNotifications(fresh.filter((item) => !item.read));
            }
          });
        })
        .catch(() => {
          fence.fail(generation);
        })
        .finally(() => {
          if (abortController === controller) abortController = null;
        });
    };

    const resetTimer = () => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
      const visible = document.visibilityState === "visible";
      fence.setVisible(visible);
      if (visible) {
        refresh();
        timer = window.setInterval(refresh, 15_000);
      } else {
        abortController?.abort();
        abortController = null;
      }
    };

    const handleFocus = () => refresh();
    const handleLocalChangeSet = () => refresh();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("mainpg:dimension-change-set", handleLocalChangeSet);
    document.addEventListener("visibilitychange", resetTimer);
    resetTimer();

    return () => {
      stopped = true;
      fence.stop();
      abortController?.abort();
      if (timer != null) window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("mainpg:dimension-change-set", handleLocalChangeSet);
      document.removeEventListener("visibilitychange", resetTimer);
    };
  }, []);

  useLayoutEffect(() => {
    const position = scrollPositions.current.restore(activeTabKey) ?? { windowY: 0, contentY: 0 };
    const frame = window.requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: position.contentY, behavior: "auto" });
      window.scrollTo({ top: position.windowY, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTabKey]);

  const scrollBackToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveActiveTabScroll = () => {
    scrollPositions.current.save(activeTabKey, {
      windowY: window.scrollY,
      contentY: contentRef.current?.scrollTop ?? 0,
    });
  };

  const activateTab = (key: string) => {
    if (key === activeTabKey) return;
    saveActiveTabScroll();
    setActiveTabKey(key);
  };

  const openModule = (id: WorkspaceModuleId) => {
    if (id === "daily_selection_collection") return;
    setExpandedGroupId(navigationGroupForModule(id, navigationGroups)?.id ?? null);
    setTabs((current) => current.some((tab) => tab.key === id) ? current : [...current, moduleTab(id, flatModules)]);
    activateTab(id);
    setWorkspaceNotice("");
  };

  const openComboGenerate = (setId: string) => {
    setExpandedGroupId("combo_workflow");
    setTabs((current) => {
      const existing = current.find((tab) => tab.moduleId === "combo_generate");
      if (existing) {
        return current.map((tab) => (tab.moduleId === "combo_generate" ? { ...tab, initialSetId: setId } : tab));
      }
      return [...current, { key: "combo_generate", moduleId: "combo_generate", label: "组合生图", icon: "", initialSetId: setId }];
    });
    activateTab("combo_generate");
    setWorkspaceNotice("");
  };

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("module") !== "personal_center" || query.get("payment") !== "success") return;

    openModule("personal_center");
    setWorkspaceNotice("支付宝支付完成，正在读取服务器积分余额。");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const openNavigationGroup = (group: WorkspaceNavigationGroup) => {
    if (expandedGroupId === group.id) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(group.id);
    openModule(group.defaultChildId);
  };

  const selectTab = (key: string) => {
    const tab = tabsRef.current.find((item) => item.key === key);
    // 目标标签已不存在（异步流程里被关闭）时直接返回，避免把 activeTabKey
    // 设成无效值导致所有面板 hidden、内容区整片空白。
    if (!tab) return;
    setExpandedGroupId(navigationGroupForModule(tab.moduleId, navigationGroups)?.id ?? null);
    activateTab(key);
  };

  const closeTab = (key: string) => {
    if (key === activeTabKey) saveActiveTabScroll();
    scrollPositions.current.remove(key);
    setTabs((current) => {
      const next = current.filter((tab) => tab.key !== key);
      if (activeTabKey === key) {
        const nextActive = next[next.length - 1] ?? moduleTab("dashboard", flatModules);
        setExpandedGroupId(navigationGroupForModule(nextActive.moduleId, navigationGroups)?.id ?? null);
        setActiveTabKey(nextActive.key);
      }
      return next;
    });
  };

  const openCollectionPanel = (directionId: string, directionName: string) => {
    const panels = tabsRef.current.filter((tab) => tab.moduleId === "daily_selection_collection");
    // 同一方向已打开则直接激活，避免同一采集数据被多个面板并发读写互相覆盖。
    const existing = panels.find((tab) => tab.directionId === directionId);
    if (existing) {
      selectTab(existing.key);
      return;
    }
    if (panels.length >= MAX_COLLECTION_PANELS) {
      setWorkspaceNotice(`最多同时打开 ${MAX_COLLECTION_PANELS} 个采集面板，请先关闭一个再继续。`);
      return;
    }

    collectionSequence.current += 1;
    const key = `daily-selection-collection-${collectionSequence.current}`;
    setTabs((current) => [...current, {
      key,
      moduleId: "daily_selection_collection",
      label: `采集·${directionName}`,
      icon: "⌕",
      directionId,
    }]);
    activateTab(key);
    setWorkspaceNotice("");
  };

  const openProcessingTask = (draftIds: number[], options: ProductProcessingOptions, premiumDraftIds: number[] = []) => {
    const openPanelCount = tabsRef.current.filter((tab) => tab.moduleId === "product_processing_tasks").length;
    if (openPanelCount >= MAX_PROCESSING_PANELS) {
      setWorkspaceNotice(`最多同时打开 ${MAX_PROCESSING_PANELS} 个处理任务，请先关闭一个再继续。`);
      return false;
    }

    processingSequence.current += 1;
    const key = `product-processing-tasks-${processingSequence.current}`;
    const premiumCount = premiumDraftIds.length;
    setTabs((current) => [...current, {
      key,
      moduleId: "product_processing_tasks",
      label: `处理·${draftIds.length}项${premiumCount ? `·精品${premiumCount}` : ''}`,
      icon: "⚙",
      draftIds,
      premiumDraftIds,
      processingOptions: options,
    }]);
    activateTab(key);
    setWorkspaceNotice("");
    return true;
  };

  const openProcessingTaskDetail = (taskId: number) => {
    const existing = tabsRef.current.find((tab) => tab.taskRunId === taskId);
    if (existing) {
      selectTab(existing.key);
      return;
    }
    processingSequence.current += 1;
    const key = `product-processing-task-${taskId}-${processingSequence.current}`;
    setTabs((current) => [...current, {
      key,
      moduleId: "product_processing_tasks",
      label: `处理·#${taskId}`,
      icon: "⚙",
      taskRunId: taskId,
    }]);
    activateTab(key);
    setWorkspaceNotice("");
  };

  // 任务完成后的预检入口：打开「预检与导出最终版」页（生成表格 → 预检修改 → 导出最终版 → 导入店小秘）
  const openProcessingPrecheck = (taskId: number, changeSetId?: string) => {
    if (changeSetId) {
      const existing = tabsRef.current.find((tab) => tab.taskId === taskId && tab.dimensionChangeSetId === changeSetId);
      if (existing) {
        activateTab(existing.key);
        return;
      }
    }
    precheckSequence.current += 1;
    const key = `product-processing-precheck-${precheckSequence.current}`;
    setTabs((current) => [...current, {
      key,
      moduleId: "product_processing_tasks",
      label: `预检·#${taskId}`,
      icon: "✓",
      taskId,
      dimensionChangeSetId: changeSetId,
    }]);
    activateTab(key);
    setWorkspaceNotice("");
  };

  const openDimensionItem = async (taskId: number, taskItemId: number) => {
    const requestKey = `${taskId}:${taskItemId}`;
    let request = dimensionOpenRequests.current.get(requestKey);
    if (!request) {
      request = importPreviewItem({ task_id: taskId, task_item_id: taskItemId });
      dimensionOpenRequests.current.set(requestKey, request);
    }
    try {
      const item = await request;
      const existing = tabsRef.current.find((tab) => tab.dimensionItemId === item.id);
      if (existing) {
        selectTab(existing.key);
        return;
      }
      const key = `dimension-canvas-${item.id}`;
      setTabs((current) => current.some((tab) => tab.dimensionItemId === item.id) ? current : [...current, {
        key,
        moduleId: "dimension_canvas",
        label: `尺寸·${item.skc || item.productDraftId}`,
        icon: "↔",
        dimensionBatchId: item.batchId,
        dimensionItemId: item.id,
        returnTaskId: taskId,
      }]);
      activateTab(key);
      setWorkspaceNotice("");
    } catch (cause) {
      setWorkspaceNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      dimensionOpenRequests.current.delete(requestKey);
    }
  };

  const renderTab = (tab: WorkspaceTab) => {
    const isActive = activeTabKey === tab.key;
    let content: ReactNode;
    switch (tab.moduleId) {
      case "dashboard":
        content = <WorkspaceHomePage onOpenModule={openModule} />;
        break;
      case "daily_selection":
      case "daily_selection_collection":
        content = <DailySelectionPage view="collection" initialDirectionId={tab.directionId} onOpenProductProcessingDraft={() => openModule("product_processing")} topbarStatusVisible={isActive} isActive={isActive} />;
        break;
      case "profit_activity":
        content = <ProfitActivityTestPage isActive={isActive} />;
        break;
      case "profit_activity_products":
        content = <ProfitActivityProductsPage isActive={isActive} />;
        break;
      case "price_verification":
        content = <PriceVerificationPage isActive={isActive} />;
        break;
      case "product_processing":
        content = <ProductProcessingVerifyPage onStartProcessing={openProcessingTask} isActive={isActive} />;
        break;
      case "product_processing_history":
        content = <ProductProcessingHistoryPage onOpenTask={openProcessingTaskDetail} onOpenPrecheck={openProcessingPrecheck} />;
        break;
      case "product_processing_tasks":
        content = tab.taskId != null ? (
          <ProductProcessingPrecheckPage taskId={tab.taskId} initialChangeSetId={tab.dimensionChangeSetId} onOpenDimensionItem={openDimensionItem} isActive={isActive} />
        ) : (
          <ProductProcessingTaskPage
            initialTaskId={tab.taskRunId}
            initialDraftIds={tab.draftIds}
            initialPremiumDraftIds={tab.premiumDraftIds}
            initialOptions={tab.processingOptions as ProductProcessingOptions | undefined}
            onOpenPrecheck={openProcessingPrecheck}
          />
        );
        break;
      case "combo_generate":
        content = <ComboKitPage isActive={isActive} initialSetId={tab.initialSetId} />;
        break;
      case "combo_prompt_preset":
        content = <ComboKitPromptPresetPage isActive={isActive} />;
        break;
      case "combo_history":
        content = <ComboKitHistoryPage isActive={isActive} onOpenSet={openComboGenerate} />;
        break;
      case "dimension_canvas":
        content = <DimensionCanvasPage initialBatchId={tab.dimensionBatchId} initialItemId={tab.dimensionItemId} onOpenPrecheck={openProcessingPrecheck} isActive={isActive} />;
        break;
      case "pod_customization":
        content = <PodCustomizationPage isActive={isActive} />;
        break;
      case "personal_center":
        content = <PersonalCenterPage />;
        break;
      default:
        content = <EmptyModulePage module={modulesById.get(tab.moduleId)!} />;
    }
    return <Suspense fallback={<ModuleFallback />}>{content}</Suspense>;
  };

  const sidebarIsCollapsed = sidebarCollapsed || isNarrowDesktop;
  const sidebarTemporarilyExpanded = sidebarIsCollapsed && sidebarHovered;

  return (
    <main className={`workspace-shell${playEntryAnimation ? " is-brand-entering" : ""}`}>
      <PeachGarden theme={theme} uiMode={uiMode} />
      <InkTap theme={theme} uiMode={uiMode} />
      <Sidebar
        collapsed={sidebarIsCollapsed && !sidebarTemporarilyExpanded}
        activeId={activeModuleId}
        expandedGroupId={expandedGroupId}
        modules={visibleModules}
        onOpenModule={openModule}
        onToggleGroup={openNavigationGroup}
        onHoverChange={setSidebarHovered}
        badges={{ dimension_canvas: dimensionNotifications.length }}
      />
      <section className="workspace-main">
        <TopNavigation sidebarPinned={!sidebarIsCollapsed} activeKey={activeTabKey} tabs={tabs} onToggleSidebar={() => setSidebarCollapsed((value) => !value)} onSelectTab={selectTab} onCloseTab={closeTab} onOpenPersonalCenter={() => openModule("personal_center")} onSignOut={onSignOut} />
        <div className="content-card" ref={contentRef}>
          {workspaceNotice && (
            <div className="workspace-notice" role="status">
              <span>!</span>
              <strong>{workspaceNotice}</strong>
              <button type="button" onClick={() => setWorkspaceNotice("")} aria-label="关闭提示">×</button>
            </div>
          )}
          {dimensionNotifications[0] && (
            <div className="workspace-notice" role="status">
              <span>↔</span>
              <strong>尺寸画布返回 {dimensionNotifications[0].completedCount} 项</strong>
              <button type="button" onClick={() => {
                const notice = dimensionNotifications[0];
                void markDimensionNotificationRead(notice.id).catch(() => undefined);
                setDimensionNotifications((current) => current.filter((item) => item.id !== notice.id));
                openProcessingPrecheck(notice.sourceTaskId, notice.changeSetId);
              }}>打开审核</button>
            </div>
          )}
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`workspace-tab-panel${activeTabKey === tab.key ? " is-active" : ""}`}
              hidden={activeTabKey !== tab.key}
            >
              {renderTab(tab)}
            </div>
          ))}
        </div>
      </section>
      <button
        type="button"
        className={`scroll-to-top ${showScrollTop ? "is-visible" : ""}`}
        onClick={scrollBackToTop}
        aria-label="返回页面顶部"
        title="返回顶部"
      >
        <span aria-hidden="true">↑</span>
      </button>
      <BrandEntryAnimation active={playEntryAnimation} onComplete={onEntryAnimationComplete} />
    </main>
  );
}
