/** expr-rules.js 的类型声明（规则唯一来源，见 expr-rules.js 顶部注释） */

export const STAT_KEYS: string[];
export const ALIAS: Record<string, string>;
export const BARE_GROUP: Record<string, string>;
export const GROUP_PREFIXES: string[];
export const KNOWN: Set<string>;
export const KEYWORDS: string[];
export const FUNCTIONS: string[];
export const FLAG_PREFIX: string;
export const NAME_CANDIDATES: string[];

export function sanitizeFlag(name: string): string;
export function normalizeExpr(src: string): string;
export function isKnownName(name: string): boolean;
export function findUnknownNames(expression: string): string[];
