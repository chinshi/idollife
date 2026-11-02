/** task-headers.js 的类型声明（tasks 表可选列表头映射，见该文件顶部注释） */

export const TASK_COLUMN_FIELDS: Map<string, string>;

export function taskColumnField(
  header: unknown,
): 'deadlineDays' | 'reset' | 'prerequisite' | 'category' | 'guideGroup' | 'autoAccept' | null;
