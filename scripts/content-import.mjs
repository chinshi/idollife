/**
 * 把 content/content.xlsx 导入成 JSON 配置表：node scripts/content-import.mjs
 * 只覆盖 8 张数据表，不碰代码。
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');
const xlsxPath = join(root, 'content', 'content.xlsx');

try {
  await access(xlsxPath);
} catch {
  console.error(`✗ 找不到 ${xlsxPath}\n  先运行：pnpm content:template`);
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);

const cell = (row, i) => {
  const v = row.getCell(i).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return v.result ?? '';
  return v;
};

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

function rows(name) {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    console.error(`✗ xlsx 缺少工作表：${name}`);
    process.exit(1);
  }
  const out = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return; // 表头
    const first = cell(row, 1);
    if (str(first) === '') return; // 空行
    out.push(row);
  });
  return out;
}

const writeJson = async (file, obj) => {
  await writeFile(join(dataDir, file), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  ✓ ${file}`);
};

// 1) actions
const actions = rows('actions').map((r) => {
  const a = {
    id: str(cell(r, 1)),
    name: str(cell(r, 2)),
    category: str(cell(r, 3)),
    stamina: num(cell(r, 5)) ?? 0,
    text: str(cell(r, 10)),
  };
  const stat = str(cell(r, 4));
  if (stat) a.stat = stat;
  const g0 = num(cell(r, 6));
  const g1 = num(cell(r, 7));
  if (g0 !== undefined && g1 !== undefined) a.gain = [g0, g1];
  const cost = num(cell(r, 8));
  if (cost !== undefined) a.cost = cost;
  const money = num(cell(r, 9));
  if (money !== undefined) a.money = money;
  return a;
});
await writeJson('actions.json', {
  _说明: '行动表：玩家可安排的训练/工作/休息。category 决定界面分组；gain 是属性成长区间；cost 花多少钱；money 赚多少钱',
  actions,
});

// 2) routine
const routine = rows('routine').map((r) => {
  const o = { id: str(cell(r, 1)), text: str(cell(r, 2)), stamina: num(cell(r, 3)) ?? 0 };
  const stat = str(cell(r, 4));
  if (stat) o.stat = stat;
  const gain = num(cell(r, 5));
  if (gain !== undefined) o.gain = gain;
  return o;
});

// 3) story + 4) choices
const choicesByEvent = new Map();
for (const r of rows('choices')) {
  const eventId = str(cell(r, 1));
  const effects = {};
  const st = num(cell(r, 5));
  if (st !== undefined) effects.stamina = st;
  const axes = {};
  for (const [i, key] of [
    [6, 'self'],
    [7, 'others'],
    [8, 'fit'],
  ]) {
    const v = num(cell(r, i));
    if (v !== undefined) axes[key] = v;
  }
  if (Object.keys(axes).length) effects.axes = axes;
  const stats = {};
  for (const [i, key] of [
    [9, 'vocal'],
    [10, 'dance'],
    [11, 'acting'],
    [12, 'talk'],
  ]) {
    const v = num(cell(r, i));
    if (v !== undefined) stats[key] = v;
  }
  if (Object.keys(stats).length) effects.stats = stats;

  const c = { id: str(cell(r, 2)), label: str(cell(r, 3)), text: str(cell(r, 4)), effects };
  const flag = str(cell(r, 13));
  if (flag) c.setFlag = flag;

  const list = choicesByEvent.get(eventId) ?? [];
  list.push(c);
  choicesByEvent.set(eventId, list);
}

const story = rows('story').map((r) => {
  const id = str(cell(r, 1));
  const o = { id, title: str(cell(r, 2)), text: str(cell(r, 4)) };
  const major = str(cell(r, 3)).toUpperCase();
  if (major === 'TRUE' || major === '1' || major === '是') o.major = true;
  const requiresRaw = str(cell(r, 5));
  if (requiresRaw) {
    try {
      o.requires = JSON.parse(requiresRaw);
    } catch {
      console.error(`✗ story.${id} 的 requires 不是合法 JSON：${requiresRaw}`);
      process.exit(1);
    }
  }
  o.choices = choicesByEvent.get(id) ?? [];
  return o;
});
await writeJson('events.json', {
  _说明: '事件表。routine=常规事件（不暂停时间，只改数值）；story=剧情事件（major=true 时暂停时间等玩家抉择）。requires 是触发条件，见 docs/22 的说明',
  routine,
  story,
});

// 5) endings
const endings = rows('endings').map((r) => ({
  id: str(cell(r, 1)),
  title: str(cell(r, 2)),
  group: str(cell(r, 3)),
  text: str(cell(r, 4)),
}));
await writeJson('endings.json', {
  _说明: '结局表：group 决定归类；判定逻辑在 endings.ts',
  endings,
});

// 6) shop
const shopRows = rows('shop');
const common = [];
const rare = [];
for (const r of shopRows) {
  const kind = str(cell(r, 1));
  const item = { name: str(cell(r, 2)), stat: str(cell(r, 3)), value: num(cell(r, 4)) ?? 0 };
  (kind === 'rare' ? rare : common).push(item);
}

// 8) balance（先读，供 shop 价格用）
const balanceRows = rows('balance');
const balance = {};
let commonPrice = 800;
let rarePrice = 2000;
for (const r of balanceRows) {
  const key = str(cell(r, 1));
  const raw = cell(r, 2);
  if (key === 'commonPrice') commonPrice = Number(raw);
  else if (key === 'rarePrice') rarePrice = Number(raw);
  else if (raw === '' || raw === null) continue;
  else if (typeof raw === 'number') balance[key] = raw;
  else if (typeof raw === 'boolean') balance[key] = raw;
  else balance[key] = str(raw);
}
await writeJson('balance.json', { _说明: '全局数值表。改这里就能调平衡，不需要碰代码', balance });

await writeJson('shop.json', {
  _说明: '装备表。common=普通（每周货架 3 件），rare=稀有（每周 1 件）',
  shop: { commonPrice, rarePrice, common, rare },
});

// 7) members
const namePool = [];
const biases = [];
for (const r of rows('members')) {
  const type = str(cell(r, 1));
  const value = str(cell(r, 2));
  if (type === 'name') namePool.push(value);
  else if (type === 'bias') biases.push(value);
}
await writeJson('members.json', {
  _说明: 'NPC 队友表：namePool 是随机名字池；biases 是偏向分布',
  members: { namePool, biases },
});

// 9) characters
const characters = rows('characters').map((r) => {
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

console.log('✓ 导入完成，接着跑 pnpm check:data 校验');
