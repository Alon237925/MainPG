import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { resolveStepperSteps } from "@/lib/stepper-flow-policy";

/**
 * 仓库没有组件渲染器（无 @testing-library/react），步进器的接线用「纯函数直测 +
 * 源码契约」断言，与 src/lib/__tests__/script-page-strategy.test.ts 风格一致。
 */
const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const stepper = read("src/components/project-stepper.tsx");
const header = read("src/components/project-header.tsx");
const assetsPage = read("src/app/project/[id]/assets/page.tsx");

describe("ProjectStepper 接受并消费 outputStrategy", () => {
  it("组件声明可选 outputStrategy 属性（undefined/null = 旧项目纯展示）", () => {
    expect(stepper).toMatch(/outputStrategy\??:\s*OutputStrategy\s*\|\s*null/);
    expect(stepper).toMatch(/import\s+type\s*\{[^}]*OutputStrategy[^}]*\}\s+from\s+"@\/lib\/creation-brief"/);
  });

  it("经 resolveStepperSteps 派生每步的主次状态", () => {
    expect(stepper).toMatch(/resolveStepperSteps\(outputStrategy\)/);
    expect(stepper).toMatch(/import\s*\{[^}]*resolveStepperSteps[^}]*\}\s*from\s+"@\/lib\/stepper-flow-policy"/);
  });

  it("主路径 / 可选徽标文案以中文字面量渲染（不新增 i18n key）", () => {
    expect(stepper).toContain("主路径");
    expect(stepper).toContain("可选");
  });
});

describe("ProjectHeader 透传 outputStrategy", () => {
  it("ProjectHeader 声明 outputStrategy 并转发给 ProjectStepper", () => {
    expect(header).toMatch(/outputStrategy\??:\s*OutputStrategy\s*\|\s*null/);
    expect(header).toMatch(/<ProjectStepper[^>]*outputStrategy=\{outputStrategy\}/);
  });

  it("projectName 属性保持不变", () => {
    expect(header).toMatch(/projectName\??:\s*string/);
    expect(header).toMatch(/<ProjectStepper/);
  });
});

describe("素材页把简报的策略传给步进器", () => {
  it("assets/page.tsx 在 ProjectHeader 调用处传入 creationBrief?.outputStrategy", () => {
    const callAt = assetsPage.indexOf("<ProjectHeader");
    expect(callAt).toBeGreaterThanOrEqual(0);
    const site = assetsPage.slice(callAt, callAt + 320);
    expect(site).toMatch(/outputStrategy=\{creationBrief\?\.outputStrategy \?\? null\}/);
  });
});

describe("纯函数与组件契约一致", () => {
  it("主路径/可选对应的英语状态由纯函数给出，徽标文案是组件侧排版", () => {
    const draft = resolveStepperSteps("draft");
    expect(draft.find((r) => r.key === "script")?.status).toBe("main");
    expect(draft.find((r) => r.key === "assets")?.status).toBe("optional");
  });
});