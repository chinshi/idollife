/**
 * 生成 Excel 内容模板：node scripts/content-template.mjs
 * 输出 content/content.xlsx（9 张表），改完用 content-import.mjs 导回 JSON
 */
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');
const outDir = join(root, 'content');

const load = async (f) => JSON.parse(await readFile(join(dataDir, f), 'utf8'));

const actions = await load('actions.json');
const events = await load('events.json');
const balance = await load('balance.json');
const endings = await load('endings.json');
const shop = await load('shop.json');
const members = await load('members.json');
const characters = await load('characters.json');

await mkdir(outDir, { recursive: true });

const wb = new ExcelJS.Workbook();
wb.creator = 'idollife';
wb.created = new Date();

function sheet(name, headers, rows) {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c, i) => {
    c.width = Math.max(10, Math.min(60, (headers[i]?.length ?? 8) + 12));
  });
  return ws;
}

// 1) 行动表
sheet(
  'actions',
  ['id', 'name', 'category', 'stat', 'stamina', 'gainMin', 'gainMax', 'cost', 'money', 'text'],
  actions.actions.map((a) => [
    a.id,
    a.name,
    a.category,
    a.stat ?? '',
    a.stamina,
    a.gain?.[0] ?? '',
    a.gain?.[1] ?? '',
    a.cost ?? '',
    a.money ?? '',
    a.text,
  ]),
);

// 2) 常规事件
sheet(
  'routine',
  ['id', 'text', 'stamina', 'stat', 'gain'],
  events.routine.map((r) => [r.id, r.text, r.stamina, r.stat ?? '', r.gain ?? '']),
);

// 3) 剧情事件
sheet(
  'story',
  ['id', 'title', 'major', 'text', 'requires'],
  events.story.map((e) => [
    e.id,
    e.title,
    e.major ? 'TRUE' : '',
    e.text,
    e.requires ? JSON.stringify(e.requires) : '',
  ]),
);

// 4) 剧情选项
const choiceRows = [];
for (const e of events.story) {
  for (const c of e.choices) {
    const fx = c.effects ?? {};
    const ax = fx.axes ?? {};
    const st = fx.stats ?? {};
    choiceRows.push([
      e.id,
      c.id,
      c.label,
      c.text,
      fx.stamina ?? '',
      ax.self ?? '',
      ax.others ?? '',
      ax.fit ?? '',
      st.vocal ?? '',
      st.dance ?? '',
      st.acting ?? '',
      st.talk ?? '',
      c.setFlag ?? '',
    ]);
  }
}
sheet(
  'choices',
  ['eventId', 'id', 'label', 'text', 'stamina', 'self', 'others', 'fit', 'vocal', 'dance', 'acting', 'talk', 'setFlag'],
  choiceRows,
);

// 5) 结局
sheet(
  'endings',
  ['id', 'title', 'group', 'text'],
  endings.endings.map((e) => [e.id, e.title, e.group, e.text]),
);

// 6) 装备
sheet('shop', ['kind', 'name', 'stat', 'value'], [
  ...shop.shop.common.map((i) => ['common', i.name, i.stat, i.value]),
  ...shop.shop.rare.map((i) => ['rare', i.name, i.stat, i.value]),
]);

// 7) NPC 池
sheet('members', ['type', 'value'], [
  ...members.members.namePool.map((n) => ['name', n]),
  ...members.members.biases.map((b) => ['bias', b]),
]);

// 8) 全局数值
sheet(
  'balance',
  ['key', 'value'],
  Object.entries({
    ...balance.balance,
    commonPrice: shop.shop.commonPrice,
    rarePrice: shop.shop.rarePrice,
  }).map(([k, v]) => [k, v]),
);

// 9) 主角模板
sheet(
  'characters',
  ['id', 'name', 'desc', 'money', 'stamina'],
  characters.characters.map((c) => [c.id, c.name, c.desc, c.initial?.money ?? '', c.initial?.stamina ?? '']),
);

const file = join(outDir, 'content.xlsx');
await wb.xlsx.writeFile(file);
console.log(`✓ 已生成模板：${file}`);
console.log('  改完后运行：pnpm content:import');
