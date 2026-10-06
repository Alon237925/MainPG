import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filmChainStrategyAllowed } from "@/lib/film-chain-gate";

/**
 * 整片链（九宫格 → 原生整片）的服务端出片策略门禁。
 * 纯判定直测 + 两个提交路由的源码契约：按钮显隐不是唯一防线，
 * storyboard-grid / storyboard-film 必须在服务端再校验一次策略。
 */
const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const gridRoute = read("src/app/api/project/[id]/storyboard-grid/route.ts");
const filmRoute = read("src/app/api/project/[id]/storyboard-film/route.ts");

describe("filmChainStrategyAllowed：整片链策略白名单", () => {
  it("native-film 与旧项目（null/undefined/未知值）放行", () => {
    expect(filmChainStrategyAllowed("native-film")).toBe(true);
    expect(filmChainStrategyAllowed(null)).toBe(true);
    expect(filmChainStrategyAllowed(undefined)).toBe(true);
    expect(filmChainStrategyAllowed("future-strategy")).toBe(true);
  });

  it("draft / controlled-motion 一律拒绝", () => {
    expect(filmChainStrategyAllowed("draft")).toBe(false);
    expect(filmChainStrategyAllowed("controlled-motion")).toBe(false);
  });
});

describe("提交路由的服务端门禁接线", () => {
  it("两条路由都导入并调用 filmChainStrategyGuard，被拒时返回 409", () => {
    for (const src of [gridRoute, filmRoute]) {
      expect(src).toMatch(/import \{ filmChainStrategyGuard \} from "@\/lib\/film-chain-gate"/);
      expect(src).toMatch(/const gate = await filmChainStrategyGuard\(id\)/);
      expect(src).toMatch(/if \(!gate\.allowed\) \{\s*return apiError\(req, .*不允许整片生成/);
    }
  });

  it("门禁位于任何生成/dryRun 逻辑之前", () => {
    expect(gridRoute.indexOf("filmChainStrategyGuard(id)")).toBeLessThan(gridRoute.indexOf("buildStoryboardGridPrompt("));
    expect(filmRoute.indexOf("filmChainStrategyGuard(id)")).toBeLessThan(filmRoute.indexOf("if (dryRun)"));
  });
});