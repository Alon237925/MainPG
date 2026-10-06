import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * 整片链（九宫格 → 原生整片）的服务端出片策略门禁。
 *
 * 按钮显隐只是第一层：storyboard-grid / storyboard-film 两个提交接口必须自己
 * 再校验一次项目的 outputStrategy，付费生成在服务端同样拒绝 draft /
 * controlled-motion 项目，只有 native-film 与旧项目（无简报/未知值）放行。
 */

/** 纯判定：允许走整片链的策略集合（便于单测，不触数据库）。 */
export function filmChainStrategyAllowed(strategy: unknown): boolean {
  return strategy !== "draft" && strategy !== "controlled-motion";
}

/**
 * 读取项目简报里的 outputStrategy 并判定整片链是否放行。
 * 读库失败时按失败关闭处理（不放大任何一次整片提交）。
 */
export async function filmChainStrategyGuard(
  projectId: string
): Promise<{ allowed: true } | { allowed: false; strategy: string }> {
  const strategy = await getDb()
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .then(
      (rows) => (rows[0]?.creationBrief as { outputStrategy?: unknown } | null | undefined)?.outputStrategy,
      () => "unknown"
    );
  return filmChainStrategyAllowed(strategy)
    ? { allowed: true }
    : { allowed: false, strategy: String(strategy) };
}