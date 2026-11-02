/**
 * 从聚合工作簿 content/all.xlsx 导入全部配置表：node scripts/content-import.mjs
 *
 * 内容源唯一：content/all.xlsx（15 个 sheet）。
 * sheet → JSON 映射：
 *   balance→balance.json ｜ attributes→attributes.json ｜ actions→actions.json
 *   results→action_results.json ｜ routine+story+choices→events.json ｜ endings→endings.json
 *   tasks→tasks.json ｜ shop→shop.json ｜ logs→logs.json ｜ channels→channels.json
 *   pools→pools.json ｜ members→members.json ｜ characters→characters.json
 *
 * 旧的分表已退役并归档到 content/_archive/，本脚本不再读取。
 */
import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';
import { taskColumnField } from '../packages/core/src/task-headers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');
const allPath = join(root, 'content', 'all.xlsx');

const cell = (row, i) => {
  const v = row.getCell(i).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return v.result ?? '';
  return v;
};
const num = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const bool = (v) => {
  const s = str(v).toUpperCase();
  return s === 'TRUE' || s === '1' || s === '是' || s === 'YES';
};

async function openAll() {
  try {
    await access(allPath);
  } catch {
    console.error('✗ 找不到 content/all.xlsx（唯一内容源）');
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(allPath);
  return wb;
}

function sheet(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    console.error(`✗ content/all.xlsx 缺少工作表「${name}」`);
    process.exit(1);
  }
  return ws;
}

/** 读取数据行（跳过表头与首列为空的行） */
function rowsOf(wb, name) {
  const ws = sheet(wb, name);
  const out = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    if (str(cell(row, 1)) === '') return;
    out.push(row);
  });
  return out;
}

/** 条件单元格：{ 开头当 JSON，否则当表达式字符串 */
const parseCond = (raw, label) => {
  const s = str(raw);
  if (!s) return {};
  if (s.trimStart().startsWith('{') || s.trimStart().startsWith('[')) {
    try {
      return JSON.parse(s);
    } catch {
      console.error(`✗ ${label} 的 JSON 写错了：${s}`);
      process.exit(1);
    }
  }
  return s;
};

const parseJsonObject = (raw, label) => {
  const s = str(raw);
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    console.error(`✗ ${label} 不是合法 JSON：${s}`);
    process.exit(1);
  }
};

/** id 列表单元格：`["a","b"]`（JSON）或 `a, b`（逗号/中文逗号分隔）；空 = undefined（字段不出现） */
const parseIdList = (raw, label) => {
  const s = str(raw);
  if (!s) return undefined;
  if (s.trimStart().startsWith('[')) {
    try {
      const v = JSON.parse(s);
      if (!Array.isArray(v)) throw new Error('不是数组');
      return v.map((x) => String(x).trim()).filter(Boolean);
    } catch (err) {
      console.error(`✗ ${label} 的 JSON 写错了：${s}（${err.message}）`);
      process.exit(1);
    }
  }
  return s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
};

const writeJson = async (file, obj) => {
  await writeFile(join(dataDir, file), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  ✓ ${file}`);
};

const wb = await openAll();
const counts = {};

// 1) 全局数值（commonPrice / rarePrice 归商店使用，不写进 balance）
{
  const balance = {};
  let commonPrice = 800;
  let rarePrice = 2000;
  for (const r of rowsOf(wb, 'balance')) {
    const key = str(cell(r, 1));
    if (!key) continue;
    const raw = cell(r, 2);
    if (key === 'commonPrice') {
      commonPrice = Number(raw);
      continue;
    }
    if (key === 'rarePrice') {
      rarePrice = Number(raw);
      continue;
    }
    if (raw === '' || raw === null) continue;
    if (typeof raw === 'number' || typeof raw === 'boolean') balance[key] = raw;
    else balance[key] = str(raw);
  }
  await writeJson('balance.json', {
    _说明: '全局数值表。改这里就能调平衡，不需要碰代码；缺少 staminaMax 时代码回落到 100',
    balance,
  });

  // 2) 装备（价格来自 balance 表的 commonPrice / rarePrice）
  const common = [];
  const rare = [];
  for (const r of rowsOf(wb, 'shop')) {
    const kind = str(cell(r, 1));
    const item = {
      name: str(cell(r, 2)),
      stat: str(cell(r, 3)),
      statName: str(cell(r, 4)),
      value: num(cell(r, 5)) ?? 0,
    };
    (kind === 'rare' ? rare : common).push(item);
  }
  await writeJson('shop.json', {
    _说明:
      '装备表。common=普通（每周货架 3 件），rare=稀有（每周 1 件）；价格取自 balance 表的 commonPrice / rarePrice',
    shop: { commonPrice, rarePrice, common, rare },
  });
  counts.shop = common.length + rare.length;
}

// 3) 属性表
{
  const attributes = rowsOf(wb, 'attributes').map((r) => ({
    category: str(cell(r, 2)),
    categoryName: str(cell(r, 1)),
    name: str(cell(r, 3)),
    key: str(cell(r, 4)),
    hidden: bool(cell(r, 5)),
    linked: num(cell(r, 6)) ?? 1,
  }));
  await writeJson('attributes.json', {
    _说明:
      '属性表：category=分类英文名（innate/visible/status/trait/negative/proficient/hidden/fans），categoryName=分类中文名；key=属性字段名，name=显示名；hidden=true 主界面不直接显示；linked 关联属性（0=完全隐藏，1=完全可见，2=隐藏仅占卜可见）',
    attributes,
  });
  counts.attributes = attributes.length;
}

// 4) 行为表
{
  const actions = rowsOf(wb, 'actions').map((r) => {
    const a = {
      id: str(cell(r, 1)),
      name: str(cell(r, 2)),
      category: str(cell(r, 4)),
      categoryName: str(cell(r, 3)),
    };
    a.displayCondition = parseCond(cell(r, 5), 'actions.' + a.id + '.displayCondition');
    a.times = num(cell(r, 6)) ?? 0;
    a.timesScope = str(cell(r, 7)) || 'run';
    a.affectedStats = str(cell(r, 8))
      ? str(cell(r, 8)).split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const dm = num(cell(r, 9));
    if (dm !== undefined) a.durationMinutes = dm;
    return a;
  });
  await writeJson('actions.json', {
    _说明:
      '行为表：定义「能做什么」。影响属性可多个；显示条件为空=一直可见；次数 0=无限制。具体收益/文案在 action_results.json 里按条件匹配',
    actions,
  });
  counts.actions = actions.length;
}

// 5) 行为结果表
{
  const parseStat = (raw) => {
    const s = str(raw);
    if (!s) return undefined;
    if (s.includes('~')) {
      const [a, b] = s.split('~').map((x) => Number(x.trim()));
      return [a, b];
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  const results = rowsOf(wb, 'results').map((r) => {
    const effects = {};
    const stamina = num(cell(r, 6));
    if (stamina !== undefined) effects.stamina = stamina;
    const money = num(cell(r, 7));
    if (money !== undefined) effects.money = money;
    const mood = num(cell(r, 8));
    if (mood !== undefined) effects.mood = mood;
    const satiety = num(cell(r, 9));
    if (satiety !== undefined) effects.satiety = satiety;
    const fans = num(cell(r, 10));
    if (fans !== undefined) effects.fans = fans;
    const stats = {};
    for (const [i2, key] of [[11, 'vocal'], [12, 'dance'], [13, 'acting'], [14, 'talk']]) {
      const v = parseStat(cell(r, i2));
      if (v !== undefined) stats[key] = v;
    }
    if (Object.keys(stats).length) effects.stats = stats;

    const o = {
      id: str(cell(r, 1)),
      actionId: str(cell(r, 2)),
      actionName: str(cell(r, 3)),
    };
    o.condition = parseCond(cell(r, 4), 'results.' + o.id + '.condition');
    o.priority = num(cell(r, 5)) ?? 99;
    o.effects = effects;
    o.text = str(cell(r, 15));
    return o;
  });

  await writeJson('action_results.json', {
    _说明:
      '行为结果表：同一个行为在不同条件下可以有不同的数值和文案。condition 为空=默认结果；priority 小的优先匹配。stats 里的数值可以是数字或 [最小值,最大值] 区间',
    results,
  });
  counts.results = results.length;
}

// 6) 事件表（routine + story + choices 合并成 events.json，choice 归属对应剧情）
{
  const routine = rowsOf(wb, 'routine').map((r) => {
    const o = { id: str(cell(r, 1)), text: str(cell(r, 2)), stamina: num(cell(r, 3)) ?? 0 };
    const stat = str(cell(r, 4));
    if (stat) {
      o.stat = stat;
      o.statName = str(cell(r, 5));
    }
    const gain = num(cell(r, 6));
    if (gain !== undefined) o.gain = gain;
    return o;
  });

  // 按表头名定位可选列（缺列 = 该选项无条件可见，向后兼容）
  const choicesWs = sheet(wb, 'choices');
  const headerIndex = new Map();
  choicesWs.getRow(1).eachCell((c, i) => {
    const name = str(c.value).toLowerCase();
    if (name) headerIndex.set(name, i);
  });
  const requiresCol = headerIndex.get('requires');

  const choicesByEvent = new Map();
  for (const r of rowsOf(wb, 'choices')) {
    const eventId = str(cell(r, 1));
    const effects = {};
    const st = num(cell(r, 5));
    if (st !== undefined) effects.stamina = st;
    const axes = {};
    for (const [i, key] of [[6, 'self'], [7, 'others'], [8, 'fit']]) {
      const v = num(cell(r, i));
      if (v !== undefined) axes[key] = v;
    }
    if (Object.keys(axes).length) effects.axes = axes;
    const stats = {};
    for (const [i, key] of [[9, 'vocal'], [10, 'dance'], [11, 'acting'], [12, 'talk']]) {
      const v = num(cell(r, i));
      if (v !== undefined) stats[key] = v;
    }
    if (Object.keys(stats).length) effects.stats = stats;

    const mood = num(cell(r, 14));
    if (mood !== undefined) effects.mood = mood;
    const satiety = num(cell(r, 15));
    if (satiety !== undefined) effects.satiety = satiety;
    const traits = parseJsonObject(cell(r, 16), `choices.${str(cell(r, 2))}.traits`);
    if (traits) effects.traits = traits;
    const negatives = parseJsonObject(cell(r, 17), `choices.${str(cell(r, 2))}.negatives`);
    if (negatives) effects.negatives = negatives;

    const c = { id: str(cell(r, 2)), label: str(cell(r, 3)), text: str(cell(r, 4)), effects };
    const flag = str(cell(r, 13));
    if (flag) c.setFlag = flag;
    const req = requiresCol ? str(cell(r, requiresCol)) : '';
    if (req) {
      c.requires = req;
      // 记下 content/all.xlsx 里的物理行号，check:data 报错时才能指回表里那一行（T-005）
      c.sourceRow = r.number;
    }

    const list = choicesByEvent.get(eventId) ?? [];
    list.push(c);
    choicesByEvent.set(eventId, list);
  }

  const story = rowsOf(wb, 'story').map((r) => {
    const id = str(cell(r, 1));
    const o = { id, title: str(cell(r, 2)), text: str(cell(r, 4)) };
    if (bool(cell(r, 3))) o.major = true;
    const requiresRaw = str(cell(r, 5));
    if (requiresRaw) {
      o.requires = parseCond(requiresRaw, 'story.' + id + '.requires');
      o.sourceRow = r.number;
    }
    o.choices = choicesByEvent.get(id) ?? [];
    return o;
  });

  await writeJson('events.json', {
    _说明:
      '事件表。routine=常规事件（不暂停时间，只改数值）；story=剧情事件（major=true 时暂停时间等玩家抉择），choices 来自 all.xlsx 的 choices 表。requires 是触发条件，见 docs/22 的说明',
    routine,
    story,
  });
  counts.routine = routine.length;
  counts.story = story.length;
  counts.choices = [...choicesByEvent.values()].reduce((n, list) => n + list.length, 0);
}

// 7) 结局
{
  const endings = rowsOf(wb, 'endings').map((r) => ({
    id: str(cell(r, 1)),
    title: str(cell(r, 2)),
    group: str(cell(r, 3)),
    groupName: str(cell(r, 4)),
    text: str(cell(r, 5)),
  }));
  await writeJson('endings.json', {
    _说明: '结局表：group=分组字段名，groupName=分组中文名；判定逻辑在 endings.ts',
    endings,
  });
  counts.endings = endings.length;
}

// 8) NPC 姓名池 / 偏向
{
  const namePool = [];
  const biases = [];
  const biasNames = {};
  for (const r of rowsOf(wb, 'members')) {
    const type = str(cell(r, 1));
    const value = str(cell(r, 2));
    const name = str(cell(r, 3));
    if (type === 'name') namePool.push(value);
    else if (type === 'bias') {
      biases.push(value);
      if (name) biasNames[value] = name;
    }
  }
  await writeJson('members.json', {
    _说明: 'NPC 队友表：namePool 是随机名字池；biases 是偏向字段名，biasNames 是偏向中文名',
    members: { namePool, biases, biasNames },
  });
  counts.members = namePool.length + biases.length;
}

// 9) 主角模板
{
  const characters = rowsOf(wb, 'characters').map((r) => {
    const o = { id: str(cell(r, 1)), name: str(cell(r, 2)), desc: str(cell(r, 3)) };
    const initial = {};
    const money = num(cell(r, 4));
    const stamina = num(cell(r, 5));
    if (money !== undefined) initial.money = money;
    if (stamina !== undefined) initial.stamina = stamina;
    if (Object.keys(initial).length) o.initial = initial;
    return o;
  });
  await writeJson('characters.json', {
    _说明: '主角模板表。初始处境/隐藏属性还没定稿，先放可见部分',
    characters,
  });
  counts.characters = characters.length;
}

// 10) 日志文案
{
  const logs = {};
  for (const r of rowsOf(wb, 'logs')) {
    const key = str(cell(r, 1));
    if (!key) continue;
    logs[key] = str(cell(r, 2));
  }
  await writeJson('logs.json', {
    _说明:
      '日志/系统文案表。key 是代码里用的键名，text 是中文文案；{n} 会被替换成数值，{name} 会被替换成名字',
    logs,
  });
  counts.logs = Object.keys(logs).length;
}

// 11) 任务表
{
  // T-007：三个可选列按**表头名**定位（与 choices.requires 同一套做法）。
  // 表头认中文（时限(天) / 时限（天） / 重置周期 / 前置任务）与英文兜底，映射见
  // packages/core/src/task-headers.js（与测试共用，含 trim / 忽略大小写 / 全半角括号）。
  // T-009：时限单位是**游戏日**；旧表头「时限(小时)」故意不识别（不静默错读一个量级）。
  // 缺列 / 单元格为空 → 字段不出现 → 代码走缺省，现有任务行为完全不变。
  const tasksWs = sheet(wb, 'tasks');
  const taskHeader = new Map();
  tasksWs.getRow(1).eachCell((c, i) => {
    const field = taskColumnField(str(c.value));
    if (field && !taskHeader.has(field)) taskHeader.set(field, i);
  });
  const deadlineCol = taskHeader.get('deadlineDays');
  const resetCol = taskHeader.get('reset');
  const prerequisiteCol = taskHeader.get('prerequisite');
  // T-017：任务三类化三列（分类 / 组 / 自动领取），与上面同一套按表头定位
  const categoryCol = taskHeader.get('category');
  const guideGroupCol = taskHeader.get('guideGroup');
  const autoAcceptCol = taskHeader.get('autoAccept');

  const tasks = rowsOf(wb, 'tasks').map((r) => {
    const x = {
      id: str(cell(r, 1)),
      type: str(cell(r, 2)),
      name: str(cell(r, 3)),
    };
    x.displayCondition = parseCond(cell(r, 4), 'tasks.' + x.id + '.displayCondition');
    x.acceptCondition = parseCond(cell(r, 5), 'tasks.' + x.id + '.acceptCondition');
    x.completeCondition = parseCond(cell(r, 6), 'tasks.' + x.id + '.completeCondition');

    const rewards = {};
    const money = num(cell(r, 7));
    if (money !== undefined) rewards.money = money;
    const stamina = num(cell(r, 8));
    if (stamina !== undefined) rewards.stamina = stamina;
    const fans = num(cell(r, 9));
    if (fans !== undefined) rewards.fans = fans;
    const stats = parseJsonObject(cell(r, 10), `tasks.${x.id}.rewards.stats`);
    if (stats && Object.keys(stats).length) rewards.stats = stats;
    x.rewards = rewards;

    x.times = num(cell(r, 11)) ?? 0;
    x.content = str(cell(r, 12));
    x.brief = str(cell(r, 13));
    x.priority = num(cell(r, 14)) ?? 99;

    if (deadlineCol) {
      const days = num(cell(r, deadlineCol));
      if (days !== undefined) x.deadlineDays = days;
    }
    if (resetCol) {
      const reset = str(cell(r, resetCol)).toLowerCase();
      if (reset) x.reset = reset;
    }
    if (prerequisiteCol) {
      const pre = parseIdList(cell(r, prerequisiteCol), `tasks.${x.id}.prerequisite`);
      if (pre && pre.length > 0) x.prerequisite = pre;
    }
    if (categoryCol) {
      const category = str(cell(r, categoryCol)).toLowerCase();
      if (category) x.category = category;
    }
    if (guideGroupCol) {
      const group = str(cell(r, guideGroupCol)).toUpperCase();
      if (group) x.guideGroup = group;
    }
    if (autoAcceptCol) {
      const raw = cell(r, autoAcceptCol);
      if (str(raw) !== '') x.autoAccept = bool(raw);
    }
    return x;
  });

  await writeJson('tasks.json', {
    _说明:
      '任务表：displayCondition=可见条件；acceptCondition=可领取条件；completeCondition=完成条件。领取后进入进行中，条件达成自动完成并发奖',
    tasks,
  });
  counts.tasks = tasks.length;
}

// 12) 成长阶段表（T-018）
{
  const stages = rowsOf(wb, 'stages').map((r) => ({
    seq: num(cell(r, 1)) ?? 0,
    id: str(cell(r, 2)),
    name: str(cell(r, 3)),
    title: str(cell(r, 4)),
    condition: parseCond(cell(r, 5), 'stages.' + str(cell(r, 2)) + '.condition'),
    buttonText: str(cell(r, 6)),
    style: str(cell(r, 7)),
    themeColor: str(cell(r, 8)),
    unlockText: str(cell(r, 9)),
  }));
  await writeJson('stages.json', {
    _说明:
      '成长阶段表：seq=顺序；condition=进入条件（表达式，空=无条件，只允许 seq=1 为空）；buttonText=晋级按钮文案；style=s1–s8 对应客户端样式类；themeColor 仅作参考；unlockText=解锁说明',
    stages,
  });
  counts.stages = stages.length;
}

// 13) 朋友圈渠道表
{
  const channels = rowsOf(wb, 'channels').map((r) => ({
    id: str(cell(r, 1)),
    name: str(cell(r, 2)),
    cost: num(cell(r, 3)) ?? 0,
    biasPool: str(cell(r, 4))
      ? str(cell(r, 4)).split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    quality: [num(cell(r, 5)) ?? 0.8, num(cell(r, 6)) ?? 1.1],
    poolId: str(cell(r, 7)),
    text: str(cell(r, 8)),
  }));
  await writeJson('channels.json', {
    _说明:
      '认识新朋友的渠道表：每个渠道花钱认识一个人，biasPool 决定大概率是什么类型，quality 是强度系数区间，poolId 指向卡池',
    channels,
  });
  counts.channels = channels.length;
}

// 13) NPC 卡池表
{
  const pools = rowsOf(wb, 'pools').map((r) => ({
    id: str(cell(r, 1)),
    name: str(cell(r, 2)),
    members: str(cell(r, 3))
      ? str(cell(r, 3)).split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  }));
  await writeJson('pools.json', {
    _说明:
      'NPC 卡池表：每个渠道从对应卡池里抽人。同一个卡池里，未满默契的角色等概率，满默契的权重减半',
    pools,
  });
  counts.pools = pools.length;
}

// 16) 消耗品表（T-019）
{
  const items = rowsOf(wb, 'items').map((r) => ({
    id: str(cell(r, 1)),
    type: str(cell(r, 2)),
    name: str(cell(r, 3)),
    rarity: str(cell(r, 4)),
    icon: str(cell(r, 5)),
    effects: parseJsonObject(cell(r, 6), 'items.' + str(cell(r, 1)) + '.effects') ?? {},
    negative: parseJsonObject(cell(r, 7), 'items.' + str(cell(r, 1)) + '.negative') ?? {},
    hidden: parseJsonObject(cell(r, 8), 'items.' + str(cell(r, 1)) + '.hidden') ?? {},
    text: str(cell(r, 9)),
    source: str(cell(r, 10)),
    price: num(cell(r, 11)) ?? 0,
  }));
  await writeJson('items.json', {
    _说明:
      '消耗品表（食物/药品）：effects=显性效果，negative=负面效果，hidden=隐藏效果（只应用不展示，文案里隐晦表达）；price=参考价',
    items,
  });
  counts.items = items.length;
}

// 17) 装备表（T-019）
{
  const equipments = rowsOf(wb, 'equipments').map((r) => ({
    id: str(cell(r, 1)),
    slot: str(cell(r, 2)),
    name: str(cell(r, 3)),
    rarity: str(cell(r, 4)),
    icon: str(cell(r, 5)),
    requirement: parseCond(cell(r, 6), 'equipments.' + str(cell(r, 1)) + '.requirement'),
    bonus: parseJsonObject(cell(r, 7), 'equipments.' + str(cell(r, 1)) + '.bonus') ?? {},
    hidden: parseJsonObject(cell(r, 8), 'equipments.' + str(cell(r, 1)) + '.hidden') ?? {},
    hiddenText: str(cell(r, 9)),
    text: str(cell(r, 10)),
    source: str(cell(r, 11)),
    price: num(cell(r, 12)) ?? 0,
  }));
  await writeJson('equipments.json', {
    _说明:
      '装备表：slot=四槽（hair/outfit/shoes/accessory）；requirement=装备要求表达式；bonus=显性加成（四维）；hidden=隐形加成（只显示隐形文案，不显示数值）',
    equipments,
  });
  counts.equipments = equipments.length;
}

console.log('\n导入行数：');
for (const [k, v] of Object.entries(counts)) console.log(`  ${k} = ${v}`);
console.log('✓ 已从 content/all.xlsx 全量导入，接着跑 pnpm check:data 校验');
