/**
 * 表头 → 字段名映射（T-009：时限单位由「小时」改为「游戏日」）。
 *
 * 内容作者在 Excel 里写中文表头，但中文输入法容易打出全角括号，所以两种括号都认；
 * 英文表头作为兜底。匹配规则：先 trim 空白，再精确匹配，最后忽略大小写匹配。
 *
 * 注意：旧表头「时限(小时)」故意**不再识别**（返回 null）——旧单位若被静默当成天读，
 * 作者按小时填的数会错一个量级且不报错，宁可忽略这一列（= 无限期）。
 *
 * 纯 JS（无依赖），导入脚本（scripts/content-import.mjs）与测试共用同一份。
 */

/** 表头别名 → 字段名（中文优先；T-009：时限单位是「游戏日」） */
const ALIASES = [
  ['时限(天)', 'deadlineDays'],
  ['时限（天）', 'deadlineDays'],
  ['deadlinedays', 'deadlineDays'],
  ['重置周期', 'reset'],
  ['reset', 'reset'],
  ['前置任务', 'prerequisite'],
  ['prerequisite', 'prerequisite'],
];

export const TASK_COLUMN_FIELDS = new Map(ALIASES);

/**
 * 把表头单元格文本映射成字段名；不是这三个可选列则返回 null。
 * @param {unknown} header 表头单元格的值
 * @returns {'deadlineDays' | 'reset' | 'prerequisite' | null}
 */
export function taskColumnField(header) {
  const name = String(header ?? '').trim();
  if (!name) return null;
  return TASK_COLUMN_FIELDS.get(name) ?? TASK_COLUMN_FIELDS.get(name.toLowerCase()) ?? null;
}
