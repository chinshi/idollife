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

  // T-017：任务三类化校验（分类必填；引导必须有组、且不带时限；限时必须有时限）
  const TASK_CATEGORIES = ['guide', 'routine', 'timed'];
  for (const task of tasks.tasks ?? []) {
    if (!TASK_CATEGORIES.includes(task.category)) {
      errors.push(
        `tasks.${task.id}.category: 必须是 ${TASK_CATEGORIES.join('/')}（当前：${task.category === undefined ? '空' : String(task.category)}）`,
      );
      continue;
    }
    if (task.category === 'guide') {
      if (typeof task.guideGroup !== 'string' || !/^G\d+$/.test(task.guideGroup)) {
        errors.push(
          `tasks.${task.id}: 引导任务必须有「组」（G1…G7），当前：${task.guideGroup === undefined ? '空' : String(task.guideGroup)}`,
        );
      }
      if (typeof task.deadlineDays === 'number' && task.deadlineDays > 0) {
        errors.push(`tasks.${task.id}: 引导任务不得同时带「时限(天)」`);
      }
    }
    if (task.category === 'timed' && !(typeof task.deadlineDays === 'number' && task.deadlineDays > 0)) {
      errors.push(`tasks.${task.id}: 限时任务必须有「时限(天)」`);
    }
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

// ── 成长阶段表（T-018）────────────────────────────────────────────────
const stages = await load('stages.json');
if (stages) {
  const list = stages.stages ?? [];
  need(Array.isArray(list) && list.length > 0, 'stages.json: stages 必须是非空数组');
  uniqueIds(list, 'stages');
  list.forEach((s, i) => {
    // seq 必须从 1 连续递增
    need(s.seq === i + 1, `stages.${s.id}: seq 必须从 1 连续递增（第 ${i + 1} 行实际 seq=${s.seq}）`);
    need(typeof s.name === 'string' && s.name, `stages.${s.id}: 缺少阶段名`);
    need(typeof s.title === 'string' && s.title, `stages.${s.id}: 缺少称号`);
    need(typeof s.style === 'string' && /^s[1-8]$/.test(s.style), `stages.${s.id}: 样式必须是 s1–s8（当前：${s.style || '空'}）`);
    // 进入条件：空只允许 seq=1；字符串表达式要能编译
    const cond = s.condition;
    const isEmpty =
      cond === undefined ||
      cond === null ||
      (typeof cond === 'object' && Object.keys(cond).length === 0);
    if (isEmpty) {
      need(s.seq === 1, `stages.${s.id}: 进入条件为空的只允许 seq=1`);
    } else if (typeof cond === 'string') {
      for (const problem of expressionProblems(cond)) {
        errors.push(`stages.${s.id}.condition: ${cond} → ${problem}`);
      }
    }
  });
}

// ── 道具表（T-019）────────────────────────────────────────────────
const RARITIES = ['common', 'uncommon', 'rare', 'legendary'];
const ITEM_TYPES = ['food', 'medicine'];
const EQUIP_SLOTS = ['hair', 'haircolor', 'outfit', 'accessory'];
const ITEM_EFFECT_KEYS = [
  'stamina', 'mood', 'stress', 'weight', 'appearance', // 显性
  'stress', 'restless', 'fatigue', 'desire', 'scandal', // 负面
  'self', 'others', 'fit', // 隐藏
];
const EQUIP_BONUS_KEYS = ['vocal', 'dance', 'acting', 'talk'];
const EQUIP_HIDDEN_KEYS = ['self', 'others', 'fit', 'desire', 'scandal'];
const itemIds = new Set();

const items = await load('items.json');
if (items) {
  need(Array.isArray(items.items) && items.items.length > 0, 'items.json: items 必须是非空数组');
  for (const item of items.items ?? []) {
    if (typeof item.id !== 'string' || !item.id) {
      errors.push('items: 存在空 id');
      continue;
    }
    if (itemIds.has(item.id)) errors.push(`items.${item.id}: id 重复`);
    itemIds.add(item.id);
    need(ITEM_TYPES.includes(item.type), `items.${item.id}: 类型必须是 food/medicine（当前：${item.type}）`);
    need(RARITIES.includes(item.rarity), `items.${item.id}: 稀有度必须是 ${RARITIES.join('/')}`);
    need(typeof item.name === 'string' && item.name, `items.${item.id}: 缺少名称`);
    need(typeof item.price === 'number' && item.price >= 0, `items.${item.id}: 参考价必须是非负数字`);
    for (const field of ['effects', 'negative', 'hidden']) {
      const obj = item[field];
      if (obj === undefined) continue;
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        errors.push(`items.${item.id}.${field}: 必须是 JSON 对象`);
        continue;
      }
      for (const key of Object.keys(obj)) {
        if (!ITEM_EFFECT_KEYS.includes(key)) errors.push(`items.${item.id}.${field}: 未知效果键 ${key}`);
        if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key])) {
          errors.push(`items.${item.id}.${field}.${key}: 数值必须是数字`);
        }
      }
    }
  }
}

const equipments = await load('equipments.json');
if (equipments) {
  need(Array.isArray(equipments.equipments) && equipments.equipments.length > 0, 'equipments.json: equipments 必须是非空数组');
  for (const eq of equipments.equipments ?? []) {
    if (typeof eq.id !== 'string' || !eq.id) {
      errors.push('equipments: 存在空 id');
      continue;
    }
    if (itemIds.has(eq.id)) errors.push(`equipments.${eq.id}: id 与 items 冲突`);
    itemIds.add(eq.id);
    need(RARITIES.includes(eq.rarity), `equipments.${eq.id}: 稀有度必须是 ${RARITIES.join('/')}`);
    need(EQUIP_SLOTS.includes(eq.slot), `equipments.${eq.id}: 槽位必须是 ${EQUIP_SLOTS.join('/')}`);
    need(typeof eq.name === 'string' && eq.name, `equipments.${eq.id}: 缺少名称`);
    need(typeof eq.price === 'number' && eq.price >= 0, `equipments.${eq.id}: 参考价必须是非负数字`);
    // 显性加成只允许四维；隐形加成只允许隐藏属性域
    if (eq.bonus !== undefined) {
      if (typeof eq.bonus !== 'object' || eq.bonus === null) errors.push(`equipments.${eq.id}.bonus: 必须是 JSON 对象`);
      else
        for (const key of Object.keys(eq.bonus)) {
          if (!EQUIP_BONUS_KEYS.includes(key)) errors.push(`equipments.${eq.id}.bonus: 未知属性键 ${key}`);
        }
    }
    if (eq.hidden !== undefined) {
      if (typeof eq.hidden !== 'object' || eq.hidden === null) errors.push(`equipments.${eq.id}.hidden: 必须是 JSON 对象`);
      else
        for (const key of Object.keys(eq.hidden)) {
          if (!EQUIP_HIDDEN_KEYS.includes(key)) errors.push(`equipments.${eq.id}.hidden: 未知隐藏键 ${key}`);
        }
    }
    // 装备要求表达式必须可编译
    if (typeof eq.requirement === 'string' && eq.requirement.trim()) {
      for (const problem of expressionProblems(eq.requirement)) {
        errors.push(`equipments.${eq.id}.requirement: ${eq.requirement} → ${problem}`);
      }
    }
  }
}

// T-032/T-033 演出表校验
const SHOW_TIERS = ['normal', 'large', 'sino', 'festival', 'birthday', 'graduate', 'debut'];
const SHOW_TYPES = ['circuit', 'one-man', 'comic', 'business', 'shoot'];
const showsData = await load('shows.json');
if (showsData) {
  need(Array.isArray(showsData.shows) && showsData.shows.length > 0, 'shows.json: shows 必须是非空数组');
  const shows = showsData.shows ?? [];
  const keys = new Set();
  const byShow = new Map();
  const FAN_KEYS = ['stage', 'gachi', 'music', 'live', 'growth', 'power'];
  for (const s of shows) {
    need(typeof s.showId === 'string' && s.showId, 'shows: 缺少 showId');
    need(typeof s.name === 'string' && s.name, `shows.${s.showId}: 缺少 name`);
    need(SHOW_TYPES.includes(s.type), `shows.${s.showId}: 未知 type ${s.type}`);
    need(SHOW_TIERS.includes(s.tier), `shows.${s.showId}: 未知 tier ${s.tier}`);
    need(['sat', 'sun', 'midweek'].includes(s.weekday), `shows.${s.showId}.${s.slot}: weekday 非法`);
    need(!('cityTier' in s), `shows.${s.showId}: 演出不再带 cityTier（城市过滤见 cities 表）`);
    need(Number(s.slotCount) >= 1, `shows.${s.showId}: slotCount 必须 ≥ 1`);
    need(Number(s.weight) > 0, `shows.${s.showId}: weight 必须 > 0（刷新权重）`);
    const key = `${s.showId}:${s.slot}`;
    need(!keys.has(key), `shows: 主键重复 → ${key}`);
    keys.add(key);
    const list = byShow.get(s.showId) ?? [];
    list.push(s);
    byShow.set(s.showId, list);
    const sum = FAN_KEYS.reduce((n, k) => n + (Number(s.audience?.[k]) || 0), 0);
    need(Math.abs(sum - 1) <= 1e-6, `shows.${s.showId}.${s.slot}: 六类粉丝权重和必须为 1（当前 ${sum}）`);
  }
  for (const [showId, list] of byShow) {
    if (list[0]?.type !== 'circuit') {
      need(list.length === 1, `shows.${showId}: ${list[0]?.type} 只能有 1 个顺位`);
    }    need(
      list.every((s) => s.tier === list[0]?.tier && s.slotCount === list[0]?.slotCount),
      `shows.${showId}: 同场演出各顺位的 tier / slotCount 必须一致`,
    );
    need(
      list.length === list[0]?.slotCount,
      `shows.${showId}: 展开行数 ${list.length} ≠ slotCount ${list[0]?.slotCount}（首末插值漏了顺位）`,
    );
    const slots = list.map((s) => s.slot).sort((a, b) => a - b);
    slots.forEach((slot, i) => need(slot === i + 1, `shows.${showId}: slot 必须从 1 连续（缺 ${i + 1}）`));
    const ordered = [...list].sort((a, b) => a.slot - b.slot);
    for (let i = 1; i < ordered.length; i += 1) {
      need(
        ordered[i].reqFame >= ordered[i - 1].reqFame,
        `shows.${showId}: 顺位越靠后 reqFame 不得下降（slot ${ordered[i].slot}）`,
      );
    }
  }

  // 同级别的刷新权重必须一致（抽取按级别加权，不一致会让概率失控）
  const tierWeight = new Map();
  for (const [, list] of byShow) {
    const d = list[0];
    const w = Number(d.weight);
    if (!tierWeight.has(d.tier)) tierWeight.set(d.tier, w);
    else need(tierWeight.get(d.tier) === w, `shows.${d.showId}: 级别 ${d.tier} 的 weight 与其他演出不一致`);
  }

  // 城市可见性：每个城市必须能刷满它自己的周末场次，且只引用合法的类型/级别
  const citiesData = await load('cities.json');
  need(!!citiesData, 'cities.json 缺失（T-033 城市可见性表）');
  const cities = citiesData?.cities ?? [];
  need(cities.length > 0, 'cities.json: cities 必须是非空数组');
  const tiers = new Set();
  const occByTier = new Map();
  for (const c of cities) {
    need([0, 1, 2, 3].includes(c.tier), `cities.${c.name}: tier 必须是 0..3`);
    need(!tiers.has(c.tier), `cities: tier 重复 → ${c.tier}`);
    tiers.add(c.tier);
    need(Array.isArray(c.types) && c.types.length > 0, `cities.${c.name}: types 不能为空`);
    need(Array.isArray(c.levels) && c.levels.length > 0, `cities.${c.name}: levels 不能为空`);
    for (const t of c.types) need(SHOW_TYPES.includes(t), `cities.${c.name}: 未知类型 ${t}`);
    for (const l of c.levels) need(SHOW_TIERS.includes(l), `cities.${c.name}: 未知级别 ${l}`);
    need(c.midMax >= c.midMin, `cities.${c.name}: 周中场次上限不得小于下限`);
    const visible = [...byShow.values()].filter((list) => {
      const d = list[0];
      return c.types.includes(d.type) && c.levels.includes(d.tier) && d.slotCount <= c.maxSlots;
    });
    occByTier.set(c.tier, visible);
    const weekendPool = visible.filter((l) => l[0].weekday !== 'midweek');
    need(
      weekendPool.length >= c.weekend,
      `cities.${c.name}: 可见周末场次只有 ${weekendPool.length} 场，不够每周 ${c.weekend} 场（池子太小）`,
    );
    const midPool = visible.filter((l) => l[0].weekday === 'midweek');
    need(
      midPool.length >= c.midMax,
      `cities.${c.name}: 可见周中场次只有 ${midPool.length} 场，不够每周 ${c.midMax} 场`,
    );
  }
  // 城市从严：高等级城市的可见池必须是低等级的超集（否则升城市反而看不到旧演出）
  const sorted = [...cities].sort((a, b) => b.tier - a.tier); // 索引越大 = 城市越大
  for (let i = 1; i < sorted.length; i += 1) {
    const small = sorted[i - 1];
    const big = sorted[i];
    const smallPool = new Set(occByTier.get(small.tier).map((l) => l[0].showId));
    const bigPool = new Set(occByTier.get(big.tier).map((l) => l[0].showId));
    for (const id of smallPool) {
      need(bigPool.has(id), `cities.${big.name}: 缺少 ${small.name} 可见的 ${id}（城市越大池子必须越大）`);
    }
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
