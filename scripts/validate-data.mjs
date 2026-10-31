/**
 * 内容配置表校验：pnpm check:data
 * 任何一张表结构写错，这里会直接报错，避免坏数据进游戏。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');

const STATS = ['vocal', 'dance', 'acting', 'talk'];
const CATEGORIES = ['growth', 'recover', 'work'];
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

const actions = await load('actions.json');
if (actions) {
  need(Array.isArray(actions.actions) && actions.actions.length > 0, 'actions.json: actions 必须是非空数组');
  uniqueIds(actions.actions ?? [], 'actions');
  for (const a of actions.actions ?? []) {
    need(CATEGORIES.includes(a.category), `actions.${a.id}: category 必须是 ${CATEGORIES.join('/')}`);
    need(typeof a.name === 'string' && a.name, `actions.${a.id}: 缺少 name`);
    need(typeof a.stamina === 'number', `actions.${a.id}: stamina 必须是数字`);
    if (a.stat !== undefined) need(STATS.includes(a.stat), `actions.${a.id}: stat 非法 → ${a.stat}`);
    if (a.gain !== undefined) {
      need(Array.isArray(a.gain) && a.gain.length === 2, `actions.${a.id}: gain 必须是 [min,max]`);
    }
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
    for (const c of e.choices ?? []) {
      need(typeof c.label === 'string' && c.label, `events.${e.id}/${c.id}: 缺少 label`);
      need(c.effects && typeof c.effects === 'object', `events.${e.id}/${c.id}: 缺少 effects`);
    }
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

if (errors.length > 0) {
  console.error(`\n✗ 配置表校验失败（${errors.length} 处）\n`);
  for (const e of errors) console.error('  - ' + e);
  console.error('');
  process.exit(1);
}

console.log('✓ 配置表校验通过');
console.log(`  actions=${actions?.actions?.length ?? 0} story=${events?.story?.length ?? 0} routine=${events?.routine?.length ?? 0} endings=${endings?.endings?.length ?? 0}`);
