/**
 * 条件表达式规则 —— 唯一来源
 *
 * 运行时编译（packages/core/src/expr.ts）与数据校验（scripts/validate-data.mjs）都从这里取规则，
 * 保证「表里能通过的表达式」与「运行时认的表达式」是同一套白名单，不会漂移出第二套：
 *   - 变量白名单（KNOWN）：四项显性属性、三轴、体力/资金/朋友圈/总属性、fans.xxx
 *   - 中文别名（ALIAS）：演唱 → vocal …
 *   - 裸字段名 → 分组前缀（BARE_GROUP）：表里写 ambitious 等价于 trait.ambitious
 *   - 允许的分组前缀（GROUP_PREFIXES）：innate / trait / neg / prof；标记（flag_xxx）另算
 *
 * 本文件是纯 JS（不碰 Node / DOM / 时间 / 随机数），既能被 TS（expr.ts）import，
 * 也能被 .mjs 脚本直接 import。类型声明在同目录的 expr-rules.d.ts。
 */

/** 四项显性属性（Stats 的 key） */
export const STAT_KEYS = ['vocal', 'dance', 'acting', 'talk'];

/** 中文别名 → 英文字段名 */
export const ALIAS = {
  演唱: 'vocal',
  舞蹈: 'dance',
  演技: 'acting',
  口才: 'talk',
  自我: 'self',
  他人: 'others',
  适配: 'fit',
  体力: 'stamina',
  资金: 'money',
  心情: 'mood',
  饱腹: 'satiety',
  粉丝数: 'friends',
  好友数: 'friends',
  总属性: 'total',
};

/** 性格/负向/熟练度的裸字段名（表里写 ambitious 等价于 trait.ambitious） */
export const BARE_GROUP = {
  kind: 'trait',
  lead: 'trait',
  coop: 'trait',
  independent: 'trait',
  ambitious: 'trait',
  passion: 'trait',
  stress: 'neg',
  restless: 'neg',
  fatigue: 'neg',
  desire: 'neg',
  scandal: 'neg',
  stage_prof: 'prof',
  song_prof: 'prof',
  choreo_prof: 'prof',
};

/** 允许的分组前缀（expr.ts 只认这四个，别在别处再加一套） */
export const GROUP_PREFIXES = ['innate', 'trait', 'neg', 'prof'];

/**
 * 除属性/分组外的固定变量
 * mood / satiety 按 D-013 第 2 条**裸名接入**（不要加 state. 之类前缀），
 * 取值与缺省 70 在 expr.ts 的 buildExprData 里；校验器与编译器共用本文件，自动同源。
 */
const FIXED_NAMES = ['self', 'others', 'fit', 'stamina', 'money', 'friends', 'total', 'mood', 'satiety'];

/** 粉丝类型（表达式里写 fans.xxx） */
const FAN_TYPES = ['stage', 'gachi', 'music', 'live', 'growth', 'power'];

/** 允许出现在表达式里的变量名 */
export const KNOWN = new Set([
  ...STAT_KEYS,
  ...FIXED_NAMES,
  ...FAN_TYPES.map((t) => `fans.${t}`),
]);

/** filtrex 关键字（不是变量） */
export const KEYWORDS = ['and', 'or', 'not', 'true', 'false', 'mod', 'in'];

/** 表达式支持的函数（变量名校验时跳过） */
export const FUNCTIONS = ['sum', 'max', 'min', 'abs'];

/** hasFlag("x") 会被转成 flag_x 这样的变量 */
export const FLAG_PREFIX = 'flag_';

/** 给「是否想写 XXX」建议用的候选名（不含 attributes.json 里的键，那个由调用方补） */
export const NAME_CANDIDATES = [
  ...Object.keys(ALIAS),
  ...Object.keys(BARE_GROUP),
  ...Object.entries(BARE_GROUP).map(([bare, group]) => `${group}.${bare}`),
  ...KNOWN,
];

export const sanitizeFlag = (name) => 'flag_' + String(name).replace(/[^A-Za-z0-9_]/g, '_');

/** 把中文别名替换成英文字段名，并把表达式整理成 filtrex 认的写法 */
export function normalizeExpr(src) {
  let out = src;
  for (const [cn, en] of Object.entries(ALIAS)) {
    out = out.split(cn).join(en);
  }
  // 裸字段名 → 带分组前缀（避免与其它变量重名歧义）
  out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (m) =>
    BARE_GROUP[m] ? `${BARE_GROUP[m]}.${m}` : m,
  );
  // hasFlag("ev:debut") → flag_ev_debut（转成变量，靠 data 求值）
  out = out.replace(/hasFlag\s*\(\s*"([^"]+)"\s*\)/g, (_m, name) => sanitizeFlag(name));

  // Godot / JS 风格运算符 → filtrex 关键字
  out = out.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
  out = out.replace(/!(?!=)/g, ' not ');
  return out;
}

/** 这个名字是否是运行时认得的变量/关键字/函数 */
export function isKnownName(name) {
  if (KEYWORDS.includes(name)) return true;
  if (FUNCTIONS.includes(name)) return true;
  if (KNOWN.has(name)) return true;
  if (name.startsWith(FLAG_PREFIX)) return true;
  return GROUP_PREFIXES.some((p) => name.startsWith(p + '.'));
}

/**
 * 找出表达式里所有运行时认不出的变量名（编译期会抛「未知变量」的那些）
 * @param {string} expression 已经过 normalizeExpr 的表达式
 * @returns {string[]}
 */
export function findUnknownNames(expression) {
  const scanSrc = expression.replace(/"[^"]*"/g, '""');
  const out = [];
  for (const name of scanSrc.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? []) {
    if (isKnownName(name)) continue;
    out.push(name);
  }
  return out;
}
