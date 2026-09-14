import { httpJson } from "../../../transport/http/client";

export type HelpAgentBootstrap = {
  faq_count: number;
  version: number;
  data_path: string;
};

export type HelpAgentCandidate = {
  faq_id: string;
  question: string;
  category: string;
};

export type HelpAgentHit = {
  type: "hit";
  faq_id: string;
  question: string;
  answer: string;
  category: string;
  matched_layer: string;
};

export type HelpAgentCandidates = {
  type: "candidates";
  candidates: HelpAgentCandidate[];
  matched_layer: string;
};

export type HelpAgentFallback = {
  type: "fallback";
  matched_layer: string;
};

export type HelpAgentSearchResult = HelpAgentHit | HelpAgentCandidates | HelpAgentFallback;

export type HelpAgentAnswer = {
  faq_id: string;
  question: string;
  answer: string;
  category: string;
};

export const helpAgentApi = {
  bootstrap: () => httpJson<HelpAgentBootstrap>("/api/help-agent/bootstrap"),
  search: (question: string) =>
    httpJson<HelpAgentSearchResult>("/api/help-agent/search", {
      method: "POST",
      body: { question },
    }),
  /** 用户点选候选后才取答案，候选阶段接口不下发答案。 */
  confirm: (faqId: string) =>
    httpJson<HelpAgentAnswer>("/api/help-agent/confirm", {
      method: "POST",
      body: { faq_id: faqId },
    }),
};

/** FAQ 分类的中文展示名。 */
export const helpAgentCategoryNames: Record<string, string> = {
  system: "系统操作",
  business: "业务问题",
  account: "账号与积分",
  workflow: "流程与策略",
};

export function categoryLabel(category: string): string {
  return helpAgentCategoryNames[category] ?? "常见问题";
}
