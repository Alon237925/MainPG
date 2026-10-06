import type { OutputStrategy } from "@/lib/creation-brief";

export type StepperStepKey = "script" | "assets" | "video" | "export";
export type StepperStepStatus = "main" | "optional";
export interface StepperStepView {
  key: StepperStepKey;
  status: StepperStepStatus | null;
  hint?: string;
}

const STEP_ORDER: readonly StepperStepKey[] = ["script", "assets", "video", "export"];

const step = (key: StepperStepKey, status: StepperStepStatus | null, hint?: string): StepperStepView =>
  hint ? { key, status, hint } : { key, status };

/**
 * 每个出片策略在四步流水线（脚本/素材/视频/导出）里的主次标注。
 * status = "main"（主路径）/ "optional"（可选工具）；"skipped" 不单列，只用
 * hint 文案里的「已跳过」表达。null/undefined（旧项目）全部返回 status=null，
 * 展示上与今天完全一致（纯胶囊，无徽标、无提示）。
 *
 * 仅影响展示，不改变任何页面的可访问性：可选步骤仍可手动进入。
 */
export function resolveStepperSteps(strategy: OutputStrategy | null | undefined): StepperStepView[] {
  switch (strategy) {
    case "draft":
      return [
        step("script", "main"),
        step("assets", "optional", "免费草稿自动任务通常代跑素材与合成，已跳过时可手动进入"),
        step("video", "optional", "免费草稿自动任务通常代跑合成，已跳过时可手动进入合成"),
        step("export", "main"),
      ];
    case "controlled-motion":
      return [
        step("script", "main"),
        step("assets", "main"),
        step("video", "main"),
        step("export", "main"),
      ];
    case "native-film":
      return [
        step("script", "main", "原生整片在脚本页预览确认"),
        step("assets", "optional", "可选工具：素材/逐镜工具仅在需要时进入"),
        step("video", "optional", "可选工具：本地合成仅在需要时进入"),
        step("export", "main"),
      ];
    default:
      return STEP_ORDER.map((key) => step(key, null));
  }
}