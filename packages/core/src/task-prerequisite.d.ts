/** task-prerequisite.js 的类型声明（任务链环检测，见该文件顶部注释） */

export function findPrerequisiteCycle(
  tasks: Array<{ id?: string; prerequisite?: unknown }>,
): string[] | null;
