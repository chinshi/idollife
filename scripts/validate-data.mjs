/**
 * 内容配置表校验：pnpm check:data
 * 任何一张表结构写错，这里会直接报错，避免坏数据进游戏。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ALIAS,
  BARE_GROUP,
  FUNCTIONS,
  NAME_CANDIDATES,
  findUnknownNames,
  normalizeExpr,
} from '../packages/core/src/expr-rules.js';
import { findPrerequisiteCycle } from '../packages/core/src/task-prerequisite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');

const STATS = ['vocal', 'dance', 'acting', 'talk'];
const CATEGORIES = ['growth', 'recover', 'work', 'performance'];
const errors = [];

async function load(name) {
  try {
    return JSON.parse(await readFile(join(dataDir, name), 'utf8'));
  } catch (err) {
    errors.push(`${name}: 无法读取或 JSON 语法错误 → ${err.message}`);
    return null;
  }
}

function need(cond, msg) {
  if (!cond) errors.push(msg);
}

function uniqueIds(list, label) {
  const seen = new Set();
  for (const item of list) {
    need(typeof item.id === 'string' && item.id, `${label}: 有条目缺少 id`);
    need(!seen.has(item.id), `${label}: id 重复 → ${item.id}`);
    seen.add(item.id);
  }
}

const attributes = await load('attributes.json');
if (attributes) {
  need(Array.isArray(attributes.attributes) && attributes.attributes.length > 0, 'attributes.json: attributes 必须是非空数组');
  uniqueIds(
    (attributes.attributes ?? []).map((a) => ({ id: a.key })),
    'attributes',
  );
  for (const a of attributes.attributes ?? []) {
    need(typeof a.category === 'string' && a.category, `attributes.${a.key}: 缺少 category`);
    need(typeof a.name === 'string' && a.name, `attributes.${a.key}: 缺少 name`);
    need(typeof a.hidden === 'boolean', `attributes.${a.key}: hidden 必须是 true/false`);
    need([0, 1, 2].includes(a.linked), `attributes.${a.key}: 关联属性只能是 0/1/2`);
  }
}
const actions = await load('actions.json');
const actionResults = await load('action_results.json');
if (actions && actionResults) {
  need(Array.isArray(actions.actions) && actions.actions.length > 0, 'actions.json: actions 必须是非空数组');
  need(Array.isArray(actionResults.results) && actionResults.results.length > 0, 'action_results.json: results 必须是非空数组');

  uniqueIds(actions.actions ?? [], 'actions');
  uniqueIds(actionResults.results ?? [], 'action_results');

  const actionIds = new Set((actions.actions ?? []).map((a) => a.id));
  const scopes = ['run', 'week', 'day'];

  for (const a of actions.actions ?? []) {
    need(CATEGORIES.includes(a.category), `actions.${a.id}: category 必须是 ${CATEGORIES.join('/')}`);
    need(typeof a.categoryName === 'string' && a.categoryName, `actions.${a.id}: 缺少 categoryName（分类中文名）`);
    need(typeof a.name === 'string' && a.name, `actions.${a.id}: 缺少 name`);
    need(typeof a.times === 'number' && a.times >= 0, `actions.${a.id}: times 必须是非负数字（0=无限制）`);
    need(scopes.includes(a.timesScope ?? 'run'), `actions.${a.id}: timesScope 必须是 ${scopes.join('/')}`);
    need(Array.isArray(a.affectedStats), `actions.${a.id}: affectedStats 必须是数组`);
    for (const s of a.affectedStats ?? []) {
      need(STATS.includes(s), `actions.${a.id}: affectedStats 含非法属性 ${s}`);
    }
  }

  for (const r of actionResults.results ?? []) {
    need(actionIds.has(r.actionId), `action_results.${r.id}: actionId 不存在 → ${r.actionId}`);
    need(typeof r.text === 'string' && r.text, `action_results.${r.id}: 缺少 text（行为文案）`);
    need(r.effects && typeof r.effects === 'object', `action_results.${r.id}: 缺少 effects`);
    if (r.effects?.fans !== undefined) {
      need(typeof r.effects.fans === 'number', `action_results.: fans 必须是数字`);
    }
    if (r.effects?.stats) {
      for (const [k, val] of Object.entries(r.effects.stats)) {
        need(STATS.includes(k), `action_results.${r.id}: effects.stats 含非法属性 ${k}`);
        const okNum = typeof val === 'number';
        const okRange = Array.isArray(val) && val.length === 2 && val.every((x) => typeof x === 'number');
        need(okNum || okRange, `action_results.${r.id}: ${k} 必须是数字或 [min,max]`);
      }
    }
  }

  // 每个行为至少要有一条默认结果（condition 为空）
  for (const id of actionIds) {
    const hasDefault = (actionResults.results ?? []).some(
      (r) => r.actionId === id && (!r.condition || Object.keys(r.condition).length === 0),
    );
    need(hasDefault, `action_results: 行为 ${id} 缺少默认结果（condition 为空的那条）`);
  }
}
const pools = await load('pools.json');
if (pools) {
  need(Array.isArray(pools.pools) && pools.pools.length > 0, 'pools.json: pools 必须是非空数组');
  uniqueIds(pools.pools ?? [], 'pools');
  for (const p of pools.pools ?? []) {
    need(Array.isArray(p.members) && p.members.length > 0, `pools.${p.id}: members 不能为空`);
  }
}
const channels = await load('channels.json');
if (channels) {
  need(Array.isArray(channels.channels) && channels.channels.length > 0, 'channels.json: channels 必须是非空数组');
  uniqueIds(channels.channels ?? [], 'channels');
  for (const c of channels.channels ?? []) {
    need(typeof c.name === 'string' && c.name, `channels.${c.id}: 缺少 name`);
    need(typeof c.cost === 'number' && c.cost >= 0, `channels.${c.id}: cost 必须是非负数字`);
    need(Array.isArray(c.biasPool) && c.biasPool.length > 0, `channels.${c.id}: biasPool 不能为空`);
    need(Array.isArray(c.quality) && c.quality.length === 2, `channels.${c.id}: quality 必须是 [min,max]`);
  }
}
const tasks = await load('tasks.json');
if (tasks) {
  need(Array.isArray(tasks.tasks) && tasks.tasks.length > 0, 'tasks.json: tasks 必须是非空数组');
  uniqueIds(tasks.tasks ?? [], 'tasks');
  for (const task of tasks.tasks ?? []) {
    need(['once', 'repeat'].includes(task.type), `tasks.${task.id}: type 必须是 once/repeat`);
    need(typeof task.name === 'string' && task.name, `tasks.${task.id}: 缺少 name`);
    need(typeof task.brief === 'string' && task.brief, `tasks.${task.id}: 缺少 brief（任务简报）`);
    need(typeof task.content === 'string' && task.content, `tasks.${task.id}: 缺少 content（任务内容）`);
    need(typeof task.priority === 'number', `tasks.${task.id}: priority 必须是数字`);
    need(typeof task.times === 'number' && task.times >= 0, `tasks.${task.id}: times 必须是非负数字（0=无限制）`);
    need(task.rewards && typeof task.rewards === 'object', `tasks.${task.id}: 缺少 rewards`);
  }

  // T-007 C：任务链 prerequisite —— ① 前置 id 必须存在 ② 不得自引用 ③ 不得成环（报环路径）
  const taskIds = new Set((tasks.tasks ?? []).map((t) => t.id));
  for (const task of tasks.tasks ?? []) {
    const pre = task.prerequisite;
    if (pre === undefined || pre === null) continue;
    if (!Array.isArray(pre)) {
      errors.push(`tasks.${task.id}.prerequisite: 必须是任务 id 数组`);
      continue;
    }
    for (const dep of pre) {
      if (typeof dep !== 'string' || !dep) {
        errors.push(`tasks.${task.id}.prerequisite: 含空 id`);
      } else if (dep === task.id) {
        errors.push(`tasks.${task.id}.prerequisite: 不能引用自己（${dep}）`);
      } else if (!taskIds.has(dep)) {
        errors.push(`tasks.${task.id}.prerequisite: 前置任务 ${dep} 不存在`);
      }
    }
  }
  const prereqCycle = findPrerequisiteCycle(tasks.tasks ?? []);
  if (prereqCycle) {
    errors.push(`tasks.prerequisite 成环：${prereqCycle.join(' → ')}`);
  }
}

// ── requires 表达式静态校验（T-005）─────────────────────────────────────
// 规则唯一来源：packages/core/src/expr-rules.js（expr.ts 编译期用的是同一份），
// 这里只做「手写拆分」的体检，完整语法正确性由 packages/core 的编译期兜底测试兜住。
const COMPARE_OPS = ['>=', '<=', '==', '!=', '=', '>', '<'];
/** attributes.json 的 category → 表达式分组前缀（拼写建议用） */
const ATTR_PREFIX = { innate: 'innate', trait: 'trait', negative: 'neg', proficient: 'prof', fans: 'fans' };

const SUGGEST_POOL = (() => {
  const pool = new Set(NAME_CANDIDATES);
  for (const a of attributes?.attributes ?? []) {
    if (!a.key) continue;
    pool.add(a.key);
    const prefix = ATTR_PREFIX[a.category];
    if (prefix) pool.add(`${prefix}.${a.key}`);
  }
  for (const [bare, group] of Object.entries(BARE_GROUP)) pool.add(`${group}.${bare}`);
  return [...pool];
})();

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** 最近的候选变量名（没有足够像的就返回空串，不乱猜） */
function nearestName(name) {
  const target = String(name).toLowerCase();
  let best = '';
  let bestDist = Infinity;
  for (const cand of SUGGEST_POOL) {
    const d = editDistance(target, cand.toLowerCase());
    if (d < bestDist || (d === bestDist && best && cand.length < best.length)) {
      best = cand;
      bestDist = d;
    }
  }
  if (!best || bestDist === 0) return '';
  const limit = target.length <= 3 ? 1 : Math.floor(target.length / 3) + 1;
  return bestDist <= limit ? best : '';
}

const tokenText = (tk) => {
  if (!tk) return '空';
  if (tk.t === 'num' || tk.t === 'id' || tk.t === 'op' || tk.t === 'str') return String(tk.v);
  return tk.t;
};

/** 一条 requires 表达式的问题列表（空数组 = 通过） */
function expressionProblems(raw) {
  const src = String(raw).trim();
  if (!src) return ['表达式是空的（无条件请把单元格留空）'];

  const problems = [];
  const normalized = normalizeExpr(src);
  const code = normalized.replace(/"[^"]*"/g, '""');

  // 1) 变量存在性（含中文别名、裸字段别名、分组前缀、flag_xxx；与 expr.ts 同一套）
  for (const name of findUnknownNames(normalized)) {
    if (name === 'NaN' || name === 'Infinity') {
      problems.push(`数字 "${name}" 不是有限数`);
      continue;
    }
    const hint = nearestName(name);
    problems.push(`变量 "${name}" 不存在${hint ? `（是否想写 "${hint}"？）` : ''}`);
  }

  // 2) 中文残留：别名表里没有的中文名，表达式编译器也不认
  const cn = code.match(/[\u4e00-\u9fa5]+/);
  if (cn) problems.push(`无法识别「${cn[0]}」：中文名只能用别名（${Object.keys(ALIAS).join(' ')}）`);

  // 3) 引号必须成对
  if ((src.match(/"/g) ?? []).length % 2 !== 0) problems.push('双引号没有配对');

  // 4) 逐 token 检查：非法字符、数字格式、运算符白名单、比较号左右操作数、括号配对
  const tokens = [];
  let cursor = 0;
  const tokenRe =
    /(\s+)|("[^"]*")|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|(>=|<=|==|!=|=|>|<|[+\-*/])|(\()|(\))|(,)/g;
  for (const m of code.matchAll(tokenRe)) {
    if (m.index > cursor) problems.push(`无法识别的字符「${code.slice(cursor, m.index)}」`);
    cursor = m.index + m[0].length;
    if (m[1]) continue;
    if (m[2]) tokens.push({ t: 'str', v: m[2] });
    else if (m[3]) {
      if (/^[A-Za-z%\u4e00-\u9fa5.%]/.test(code.slice(cursor))) {
        problems.push(`数字「${m[3]}」后面不能带单位或多余字符`);
      }
      tokens.push({ t: 'num', v: m[3] });
    } else if (m[4]) tokens.push({ t: 'id', v: m[4] });
    else if (m[5]) tokens.push({ t: 'op', v: m[5] });
    else if (m[6]) tokens.push({ t: '(' });
    else if (m[7]) tokens.push({ t: ')' });
    else tokens.push({ t: ',' });
  }
  if (cursor < code.length) problems.push(`无法识别的字符「${code.slice(cursor)}」`);

  let expectOperand = true;
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];
    if (tk.t === 'str') {
      if (!expectOperand) problems.push('字符串前面缺少运算符');
      expectOperand = false;
    } else if (tk.t === 'num') {
      if (!expectOperand) problems.push(`数字 ${tk.v} 前面缺少运算符`);
      expectOperand = false;
    } else if (tk.t === 'id') {
      if (tk.v === 'and' || tk.v === 'or') {
        if (expectOperand) problems.push(`「${tk.v}」前面缺少表达式`);
        expectOperand = true;
      } else if (tk.v === 'not') {
        if (!expectOperand) problems.push('「not」前面缺少运算符');
        expectOperand = true;
      } else if (!expectOperand) {
        problems.push(`「${tk.v}」前面缺少运算符`);
      } else if (tokens[i + 1]?.t === '(') {
        if (!FUNCTIONS.includes(tk.v)) {
          problems.push(`「${tk.v}」后面不能直接跟括号（函数只有 ${FUNCTIONS.join('/')}）`);
        }
        expectOperand = true;
      } else {
        expectOperand = false;
      }
    } else if (tk.t === 'op') {
      const isCompare = COMPARE_OPS.includes(tk.v);
      if (isCompare || tk.v === '*' || tk.v === '/') {
        if (expectOperand) problems.push(`「${tk.v}」左边缺少变量`);
        expectOperand = true;
      } else if (!expectOperand) {
        expectOperand = true;
      }
      if (isCompare) {
        const rhs = tokens[i + 1];
        const value = rhs?.t === 'op' && (rhs.v === '-' || rhs.v === '+') ? tokens[i + 2] : rhs;
        if (value?.t !== 'num') {
          problems.push(`「${tk.v}」右边必须是数字（实际是「${tokenText(value)}」）`);
        }
      }
    } else if (tk.t === '(') {
      depth += 1;
      expectOperand = true;
    } else if (tk.t === ')') {
      depth -= 1;
      if (depth < 0) {
        problems.push('右括号多了');
        depth = 0;
      } else if (expectOperand) {
        problems.push('括号里是空的');
      }
      expectOperand = false;
    } else {
      // 逗号：函数参数分隔
      expectOperand = true;
    }
  }
  if (tokens.length > 0 && expectOperand) problems.push('表达式不完整（末尾缺少操作数）');
  if (depth !== 0) problems.push('括号没有配对');
  return problems;
}

/** 校验一条 requires，报错里带 sheet、行号、eventId/choiceId、原表达式 */
function checkRequiresField(expr, sheet, id, row) {
  if (expr === undefined || expr === null) return;
  if (typeof expr === 'object' && !Array.isArray(expr)) return; // 旧 JSON 对象条件继续兼容
  const rowText = typeof row === 'number' ? `第 ${row} 行` : '行号未知（重新导入可补上）';
  const where = `${sheet}.json 校验失败：content/all.xlsx#${sheet} ${rowText} ${id}`;
  if (typeof expr !== 'string') {
    errors.push(`${where}: requires 必须是表达式字符串（当前是 ${Array.isArray(expr) ? 'array' : typeof expr}）`);
    return;
  }
  for (const problem of expressionProblems(expr)) {
    errors.push(`${where}: requires "${expr}" → ${problem}`);
  }
}

const events = await load('events.json');
if (events) {
  need(Array.isArray(events.routine), 'events.json: routine 必须是数组');
  need(Array.isArray(events.story), 'events.json: story 必须是数组');
  uniqueIds(events.routine ?? [], 'events.routine');
  uniqueIds(events.story ?? [], 'events.story');

  for (const e of events.story ?? []) {
    need(typeof e.title === 'string' && e.title, `events.story.${e.id}: 缺少 title`);
    need(Array.isArray(e.choices) && e.choices.length > 0, `events.story.${e.id}: 至少要有一个选项`);
    uniqueIds(
      (e.choices ?? []).map((c) => ({ id: c.id })),
      `events.story.${e.id}.choices`,
    );
    checkRequiresField(e.requires, 'story', e.id, e.sourceRow);
    for (const c of e.choices ?? []) {
      need(typeof c.label === 'string' && c.label, `events.${e.id}/${c.id}: 缺少 label`);
      need(c.effects && typeof c.effects === 'object', `events.${e.id}/${c.id}: 缺少 effects`);
      checkRequiresField(c.requires, 'choices', `${e.id}/${c.id}`, c.sourceRow);
    }
  }
  for (const r of events.routine ?? []) {
    checkRequiresField(r.requires, 'routine', r.id, r.sourceRow);
  }
}

const balance = await load('balance.json');
if (balance) {
  const b = balance.balance ?? {};
  for (const key of ['actionMinutes', 'dailySlots', 'showSlots', 'startMoney', 'rentPerWeek', 'debutThreshold', 'runDays']) {
    need(typeof b[key] === 'number', `balance.json: 缺少数字字段 ${key}`);
  }
  need(b.dailySlots > 0, 'balance.json: dailySlots 必须大于 0');
  need(b.actionMinutes > 0, 'balance.json: actionMinutes 必须大于 0');
  if (typeof b.routineChance === 'number') {
    need(b.routineChance >= 0 && b.routineChance <= 1, 'balance.json: routineChance 必须在 0~1');
  }
}

const characters = await load('characters.json');
if (characters) {
  need(Array.isArray(characters.characters), 'characters.json: characters 必须是数组');
  uniqueIds(characters.characters ?? [], 'characters');
}

const members = await load('members.json');
if (members) {
  need((members.members?.namePool ?? []).length > 0, 'members.json: namePool 不能为空');
  need((members.members?.biases ?? []).length > 0, 'members.json: biases 不能为空');
}

const shop = await load('shop.json');
if (shop) {
  const s = shop.shop ?? {};
  need((s.common ?? []).length > 0, 'shop.json: common 不能为空');
  need((s.rare ?? []).length > 0, 'shop.json: rare 不能为空');
  for (const item of [...(s.common ?? []), ...(s.rare ?? [])]) {
    need(STATS.includes(item.stat), `shop.${item.name}: stat 非法 → ${item.stat}`);
    need(typeof item.value === 'number', `shop.${item.name}: value 必须是数字`);
  }
}

const endings = await load('endings.json');
if (endings) {
  need(Array.isArray(endings.endings), 'endings.json: endings 必须是数组');
  uniqueIds(endings.endings ?? [], 'endings');
  for (const e of endings.endings ?? []) {
    need(typeof e.title === 'string' && e.title.length <= 8, `endings.${e.id}: title 建议 4 字以内`);
  }
}

// 枚举字段必须同时有「字段名 + 中文名」
for (const a of actions?.actions ?? []) {
  need(typeof a.categoryName === 'string' && a.categoryName, `actions.${a.id}: 缺少 categoryName（分类中文名）`);
  if (a.stat) need(typeof a.statName === 'string' && a.statName, `actions.${a.id}: 缺少 statName（属性中文名）`);
}
for (const r of events?.routine ?? []) {
  if (r.stat) need(typeof r.statName === 'string' && r.statName, `routine.${r.id}: 缺少 statName（属性中文名）`);
}
for (const e of endings?.endings ?? []) {
  need(typeof e.groupName === 'string' && e.groupName, `endings.${e.id}: 缺少 groupName（分组中文名）`);
}
for (const i of [...(shop?.shop?.common ?? []), ...(shop?.shop?.rare ?? [])]) {
  need(typeof i.statName === 'string' && i.statName, `shop.${i.name}: 缺少 statName（属性中文名）`);
}
const bm = members?.members ?? {};
for (const b of bm.biases ?? []) {
  need(bm.biasNames?.[b], `members: 倾向 ${b} 缺少中文名（biasNames）`);
}

if (errors.length > 0) {
  console.error(`\n✗ 配置表校验失败（${errors.length} 处）\n`);
  for (const e of errors) console.error('  - ' + e);
  console.error('');
  process.exit(1);
}

console.log('✓ 配置表校验通过');
console.log(`  actions=${actions?.actions?.length ?? 0} story=${events?.story?.length ?? 0} routine=${events?.routine?.length ?? 0} endings=${endings?.endings?.length ?? 0}`);
