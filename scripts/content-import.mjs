/**
 * 把 content/*.xlsx 导入成 JSON 配置表：node scripts/content-import.mjs
 * 每个 xlsx 对应一张（或一组）表；缺文件会跳过并提示。
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'packages', 'core', 'data');
const outDir = join(root, 'content');

const cell = (row, i) => {
  const v = row.getCell(i).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return v.result ?? '';
  return v;
};
const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const bool = (v) => {
  const s = str(v).toUpperCase();
  return s === 'TRUE' || s === '1' || s === '是' || s === 'YES';
};

async function openWb(file) {
  const path = join(outDir, file);
  try {
    await access(path);
  } catch {
    return null;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb;
}

function rowsOf(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`缺少工作表 ${name}`);
  const out = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    if (str(cell(row, 1)) === '') return;
    out.push(row);
  });
  return out;
}

const writeJson = async (file, obj) => {
  await writeFile(join(dataDir, file), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  ✓ ${file}`);
};

let done = 0;
const skip = (f) => console.log(`  - 跳过 ${f}（文件不存在）`);

// 1) 属性表
{
  const wb = await openWb('attributes.xlsx');
  if (!wb) skip('attributes.xlsx');
  else {
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
        '属性表：category=分类英文名（visible/hidden/status/fans），categoryName=分类中文名；key=属性字段名，name=显示名；hidden=true 不在主界面显示；linked 关联属性（0=完全隐藏，1=完全可见，2=隐藏仅占卜可见）',
      attributes,
    });
    done++;
  }
}

// 2) 行动表
{
  const wb = await openWb('actions.xlsx');
  if (!wb) skip('actions.xlsx');
  else {
    const actions = rowsOf(wb, 'actions').map((r) => {
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
      _说明:
        '行动表：玩家可安排的训练/工作/休息。category 决定界面分组；gain 是属性成长区间；cost 花多少钱；money 赚多少钱',
      actions,
    });
    done++;
  }
}

// 3) 事件表
{
  const wb = await openWb('events.xlsx');
  if (!wb) skip('events.xlsx');
  else {
    const routine = rowsOf(wb, 'routine').map((r) => {
      const o = { id: str(cell(r, 1)), text: str(cell(r, 2)), stamina: num(cell(r, 3)) ?? 0 };
      const stat = str(cell(r, 4));
      if (stat) o.stat = stat;
      const gain = num(cell(r, 5));
      if (gain !== undefined) o.gain = gain;
      return o;
    });

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

      const c = { id: str(cell(r, 2)), label: str(cell(r, 3)), text: str(cell(r, 4)), effects };
      const flag = str(cell(r, 13));
      if (flag) c.setFlag = flag;
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
      _说明:
        '事件表。routine=常规事件（不暂停时间，只改数值）；story=剧情事件（major=true 时暂停时间等玩家抉择）。requires 是触发条件，见 docs/22 的说明',
      routine,
      story,
    });
    done++;
  }
}

// 4) 结局
{
  const wb = await openWb('endings.xlsx');
  if (!wb) skip('endings.xlsx');
  else {
    const endings = rowsOf(wb, 'endings').map((r) => ({
      id: str(cell(r, 1)),
      title: str(cell(r, 2)),
      group: str(cell(r, 3)),
      text: str(cell(r, 4)),
    }));
    await writeJson('endings.json', { _说明: '结局表：group 决定归类；判定逻辑在 endings.ts', endings });
    done++;
  }
}

// 5) 装备 + 6) 全局数值（装备价格来自 balance）
{
  const shopWb = await openWb('shop.xlsx');
  const balanceWb = await openWb('balance.xlsx');

  const balance = {};
  let commonPrice = 800;
  let rarePrice = 2000;
  if (balanceWb) {
    for (const r of rowsOf(balanceWb, 'balance')) {
      const key = str(cell(r, 1));
      const raw = cell(r, 2);
      if (key === 'commonPrice') commonPrice = Number(raw);
      else if (key === 'rarePrice') rarePrice = Number(raw);
      else if (raw === '' || raw === null) continue;
      else if (typeof raw === 'number' || typeof raw === 'boolean') balance[key] = raw;
      else balance[key] = str(raw);
    }
    await writeJson('balance.json', { _说明: '全局数值表。改这里就能调平衡，不需要碰代码', balance });
    done++;
  } else skip('balance.xlsx');

  if (shopWb) {
    const common = [];
    const rare = [];
    for (const r of rowsOf(shopWb, 'shop')) {
      const kind = str(cell(r, 1));
      const item = { name: str(cell(r, 2)), stat: str(cell(r, 3)), value: num(cell(r, 4)) ?? 0 };
      (kind === 'rare' ? rare : common).push(item);
    }
    await writeJson('shop.json', {
      _说明: '装备表。common=普通（每周货架 3 件），rare=稀有（每周 1 件）',
      shop: { commonPrice, rarePrice, common, rare },
    });
    done++;
  } else skip('shop.xlsx');
}

// 7) NPC 池
{
  const wb = await openWb('members.xlsx');
  if (!wb) skip('members.xlsx');
  else {
    const namePool = [];
    const biases = [];
    for (const r of rowsOf(wb, 'members')) {
      const type = str(cell(r, 1));
      const value = str(cell(r, 2));
      if (type === 'name') namePool.push(value);
      else if (type === 'bias') biases.push(value);
    }
    await writeJson('members.json', {
      _说明: 'NPC 队友表：namePool 是随机名字池；biases 是偏向分布',
      members: { namePool, biases },
    });
    done++;
  }
}

// 8) 主角模板
{
  const wb = await openWb('characters.xlsx');
  if (!wb) skip('characters.xlsx');
  else {
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
    done++;
  }
}

// 9) 日志文案
{
  const wb = await openWb('logs.xlsx');
  if (!wb) skip('logs.xlsx');
  else {
    const logs = {};
    for (const r of rowsOf(wb, 'logs')) {
      const key = str(cell(r, 1));
      if (!key) continue;
      logs[key] = str(cell(r, 2));
    }
    await writeJson('logs.json', {
      _说明: '日志/系统文案表。{n} 会被替换成数值，{name} 会被替换成名字',
      logs,
    });
    done++;
  }
}

console.log(`✓ 导入了 ${done} 张表，接着跑 pnpm check:data 校验`);
