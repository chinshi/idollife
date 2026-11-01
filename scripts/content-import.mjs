/**
 * 把 content/*.xlsx 导入成 JSON 配置表：node scripts/content-import.mjs
 * 每个 xlsx 对应一张（或一组）表；缺文件会跳过并提示。
 */
import { access, stat as fsStat, writeFile } from 'node:fs/promises';
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

async function openWb(file, jsonName) {
  const path = join(outDir, file);
  try {
    await access(path);
  } catch {
    return null;
  }
  // 防止拿旧表覆盖新数据：表比 JSON 旧就跳过
  if (jsonName) {
    try {
      const [x, j] = await Promise.all([
        fsStat(path),
        fsStat(join(dataDir, jsonName)),
      ]);
      if (x.mtimeMs < j.mtimeMs) {
        console.warn(`  ⚠ 跳过 ${file}：表格比 ${jsonName} 旧，请先运行 pnpm content:template`);
        return null;
      }
    } catch {
      /* JSON 不存在时照常导入 */
    }
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
  const wb = await openWb('attributes.xlsx', 'attributes.json');
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

// 2) 行为表
{
  const wb = await openWb('actions.xlsx', 'actions.json');
  if (!wb) skip('actions.xlsx');
  else {
    const actions = rowsOf(wb, 'actions').map((r) => {
      const a = {
        id: str(cell(r, 1)),
        name: str(cell(r, 2)),
        category: str(cell(r, 4)),
        categoryName: str(cell(r, 3)),
      };
      const dc = str(cell(r, 5));
      a.displayCondition = dc ? JSON.parse(dc) : {};
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
    done++;
  }
}

// 2.5) 行为结果表
{
  const wb = await openWb('action_results.xlsx', 'action_results.json');
  if (!wb) skip('action_results.xlsx');
  else {
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
      const fans = num(cell(r, 8));
      if (fans !== undefined) effects.fans = fans;
      const stats = {};
      for (const [i2, key] of [[9, 'vocal'], [10, 'dance'], [11, 'acting'], [12, 'talk']]) {
        const v = parseStat(cell(r, i2));
        if (v !== undefined) stats[key] = v;
      }
      if (Object.keys(stats).length) effects.stats = stats;

      const o = {
        id: str(cell(r, 1)),
        actionId: str(cell(r, 2)),
        actionName: str(cell(r, 3)),
      };
      const cond = str(cell(r, 4));
      o.condition = cond ? JSON.parse(cond) : {};
      o.priority = num(cell(r, 5)) ?? 99;
      o.effects = effects;
      o.text = str(cell(r, 13));
      return o;
    });

    await writeJson('action_results.json', {
      _说明:
        '行为结果表：同一个行为在不同条件下可以有不同的数值和文案。condition 为空=默认结果；priority 小的优先匹配。stats 里的数值可以是数字或 [最小值,最大值] 区间',
      results,
    });
    done++;
  }
}
// 3) 事件表
{
  const wb = await openWb('events.xlsx', 'events.json');
  if (!wb) skip('events.xlsx');
  else {
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
  const wb = await openWb('endings.xlsx', 'endings.json');
  if (!wb) skip('endings.xlsx');
  else {
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
    done++;
  }
}

// 5) 装备 + 6) 全局数值
{
  const shopWb = await openWb('shop.xlsx', 'shop.json');
  const balanceWb = await openWb('balance.xlsx', 'balance.json');

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
      const item = {
        name: str(cell(r, 2)),
        stat: str(cell(r, 3)),
        statName: str(cell(r, 4)),
        value: num(cell(r, 5)) ?? 0,
      };
      (kind === 'rare' ? rare : common).push(item);
    }
    await writeJson('shop.json', {
      _说明: '装备表。common=普通（每周货架 3 件），rare=稀有（每周 1 件）；stat/statName 是属性字段名与中文名',
      shop: { commonPrice, rarePrice, common, rare },
    });
    done++;
  } else skip('shop.xlsx');
}

// 7) NPC 池
{
  const wb = await openWb('members.xlsx', 'members.json');
  if (!wb) skip('members.xlsx');
  else {
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
    done++;
  }
}

// 8) 主角模板
{
  const wb = await openWb('characters.xlsx', 'characters.json');
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
  const wb = await openWb('logs.xlsx', 'logs.json');
  if (!wb) skip('logs.xlsx');
  else {
    const logs = {};
    for (const r of rowsOf(wb, 'logs')) {
      const key = str(cell(r, 1));
      if (!key) continue;
      logs[key] = str(cell(r, 2));
    }
    await writeJson('logs.json', {
      _说明: '日志/系统文案表。key 是代码里用的键名，text 是中文文案；{n} 会被替换成数值，{name} 会被替换成名字',
      logs,
    });
    done++;
  }
}

// 10) 任务表
{
  const wb = await openWb('tasks.xlsx', 'tasks.json');
  if (!wb) skip('tasks.xlsx');
  else {
    const parseJson = (raw, label) => {
      const s = str(raw);
      if (!s) return {};
      try {
        return JSON.parse(s);
      } catch {
        console.error(`✗ ${label} 不是合法 JSON：${s}`);
        process.exit(1);
      }
    };

    const tasks = rowsOf(wb, 'tasks').map((r) => {
      const x = {
        id: str(cell(r, 1)),
        type: str(cell(r, 2)),
        name: str(cell(r, 3)),
      };
      x.displayCondition = parseJson(cell(r, 4), `tasks.${x.id}.displayCondition`);
      x.acceptCondition = parseJson(cell(r, 5), `tasks.${x.id}.acceptCondition`);
      x.completeCondition = parseJson(cell(r, 6), `tasks.${x.id}.completeCondition`);

      const rewards = {};
      const money = num(cell(r, 7));
      if (money !== undefined) rewards.money = money;
      const stamina = num(cell(r, 8));
      if (stamina !== undefined) rewards.stamina = stamina;
      const fans = num(cell(r, 9));
      if (fans !== undefined) rewards.fans = fans;
      const stats = str(cell(r, 10)) ? parseJson(cell(r, 10), `tasks.${x.id}.rewards.stats`) : undefined;
      if (stats && Object.keys(stats).length) rewards.stats = stats;
      x.rewards = rewards;

      x.times = num(cell(r, 11)) ?? 0;
      x.content = str(cell(r, 12));
      x.brief = str(cell(r, 13));
      x.priority = num(cell(r, 14)) ?? 99;
      return x;
    });

    await writeJson('tasks.json', {
      _说明:
        '任务表：displayCondition=可见条件；acceptCondition=可领取条件；completeCondition=完成条件。领取后进入进行中，条件达成自动完成并发奖',
      tasks,
    });
    done++;
  }
}

// 11) 朋友圈渠道表
{
  const wb = await openWb('channels.xlsx', 'channels.json');
  if (!wb) skip('channels.xlsx');
  else {
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
    done++;
  }
}

// 12) NPC 卡池表
{
  const wb = await openWb('pools.xlsx', 'pools.json');
  if (!wb) skip('pools.xlsx');
  else {
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
    done++;
  }
}
console.log(`✓ 导入了 ${done} 张表，接着跑 pnpm check:data 校验`);
