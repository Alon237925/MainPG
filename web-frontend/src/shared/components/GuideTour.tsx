import { driver, type DriveStep, type Driver } from "driver.js";

/** 看过新手引导后写入 localStorage 的标记：首次登录只自动弹一次。 */
export const GUIDE_SEEN_KEY = "jye_workspace_guide_seen";

/** 引导覆盖的两个页面：采集页与草稿池页。 */
export type GuidePageId = "daily_selection" | "product_processing";

type GuideTourOptions = {
  /** 引导需要跨页时回调，由工作台执行真正的切页。 */
  onRequestPage: (page: GuidePageId) => void;
  /** 引导结束（完成 / 跳过 / Esc）后的回调。 */
  onFinish?: () => void;
};

export function hasSeenGuide(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGuideSeen(): void {
  try {
    window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    // 隐私模式等场景下 localStorage 不可用，忽略即可。
  }
}

/** 目标元素出现的等待上限：跨页切页后要留出 React 提交与入场的时间。 */
const WAIT_FOR_ELEMENT_MS = 4000;

/** 每一步所属页面，下标与步骤一一对应；跨页时据此切换。 */
const STEP_PAGES: GuidePageId[] = [
  "daily_selection",
  "daily_selection",
  "daily_selection",
  "product_processing",
  "product_processing",
];

/**
 * 按选择器顺序取第一个「真实可见」的元素。
 * 各模块面板常驻挂载（未激活时靠 hidden 隐藏），同一类名还会出现在多个未激活面板里，
 * 直接 querySelector 会命中尺寸为 0 的隐藏节点，导致高亮落空；因此逐个匹配项按尺寸过滤。
 * 都取不到时返回 null，driver.js 会按 waitForElement 继续等待；
 * 其类型声明未覆盖空返回值这一运行时分支，故此处断言。
 */
function visible(...selectors: string[]): () => Element {
  return () => {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return element;
      }
    }
    return null as unknown as Element;
  };
}

/** 5 步引导，文案与产品标注截图一一对应。 */
const GUIDE_STEPS: DriveStep[] = [
  {
    element: visible(".daily-collection-workspace .daily-page-heading"),
    waitForElement: WAIT_FOR_ELEMENT_MS,
    popover: {
      title: "每日选品",
      description: "在这一步我们来采集需要批量出图的链接",
      side: "bottom",
      align: "start",
    },
  },
  {
    // 整店/插件采集模式下没有字段区，退回高亮整个采集面板，避免这一步卡住。
    element: visible(".daily-collection-workspace .collection-primary-fields", ".daily-collection-surface"),
    waitForElement: WAIT_FOR_ELEMENT_MS,
    popover: {
      title: "采集条件",
      description: "填写一些关键信息点击开始采集",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: visible(".daily-collection-workspace .results-actions .confirm-button"),
    waitForElement: WAIT_FOR_ELEMENT_MS,
    popover: {
      title: "确认入池",
      description: "勾选完之后点击确认入池",
      side: "bottom",
      align: "end",
    },
  },
  {
    // .verify-section 在其它「产品处理」子页面也存在，按首个可见项取，落在草稿池列表区上。
    element: visible(".verify-page .verify-section"),
    waitForElement: WAIT_FOR_ELEMENT_MS,
    popover: {
      title: "草稿池",
      description: "刚添加完的商品链接就会出现在草稿池啦",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: visible(".verify-page .verify-actions button.primary"),
    waitForElement: WAIT_FOR_ELEMENT_MS,
    popover: {
      title: "开始处理",
      description: "选好商品之后就可以开始处理啦",
      side: "bottom",
      align: "end",
    },
  },
];

/** 启动蒙版引导，返回 driver 实例（可 isActive() / destroy()）。 */
export function startGuideTour({ onRequestPage, onFinish }: GuideTourOptions): Driver {
  let tour: Driver | null = null;

  /** 前后翻页时若跨页，先请求切页；目标元素由 waitForElement 兜底等待。 */
  const switchPageFor = (from: number, to: number) => {
    const page = STEP_PAGES[to];
    if (page && page !== STEP_PAGES[from]) onRequestPage(page);
  };

  tour = driver({
    steps: GUIDE_STEPS,
    animate: true,
    duration: 320,
    overlayColor: "#0b2136",
    overlayOpacity: 0.62,
    stagePadding: 8,
    stageRadius: 14,
    popoverOffset: 12,
    smoothScroll: true,
    allowClose: true,
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "下一步",
    prevBtnText: "上一步",
    doneBtnText: "开始使用",
    showButtons: ["next", "previous", "close"],
    onNextClick: () => {
      const index = tour?.getActiveIndex();
      if (index === undefined) return;
      switchPageFor(index, index + 1);
      tour?.moveNext();
    },
    onPrevClick: () => {
      const index = tour?.getActiveIndex();
      if (index === undefined) return;
      switchPageFor(index, index - 1);
      tour?.movePrevious();
    },
    onDestroyed: () => onFinish?.(),
  });

  tour.drive(0);
  return tour;
}
