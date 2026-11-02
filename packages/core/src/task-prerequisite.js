/**
 * 任务链（prerequisite）环检测 —— 纯函数，无依赖。
 *
 * 数据校验（scripts/validate-data.mjs，pnpm check:data）与单元测试共用这一份，
 * 避免「脚本里一套、测试里一套」。
 */

/**
 * 找出 prerequisite 依赖里的第一个环。
 *
 * @param {Array<{ id?: string; prerequisite?: unknown }>} tasks 任务列表（tasks.json 的 tasks）
 * @returns {string[] | null} 环路径（首尾同一个 id，如 `['a','b','a']`）；无环返回 null
 */
export function findPrerequisiteCycle(tasks) {
  const byId = new Map();
  for (const task of tasks ?? []) {
    if (task && typeof task.id === 'string' && task.id) byId.set(task.id, task);
  }

  const state = new Map(); // 1 = 正在访问（在当前路径上），2 = 已完成
  const path = [];
  let cycle = null;

  const visit = (id) => {
    if (cycle) return;
    const seen = state.get(id);
    if (seen === 2) return;
    if (seen === 1) {
      const start = path.indexOf(id);
      cycle = [...path.slice(start), id];
      return;
    }

    state.set(id, 1);
    path.push(id);
    const deps = byId.get(id)?.prerequisite;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        // 不存在的 id 由调用方单独报「前置任务不存在」，这里跳过，避免环路径里混进噪声
        if (typeof dep === 'string' && byId.has(dep)) visit(dep);
      }
    }
    path.pop();
    state.set(id, 2);
  };

  for (const id of byId.keys()) visit(id);
  return cycle;
}
