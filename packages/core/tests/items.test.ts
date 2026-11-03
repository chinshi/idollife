import { describe, expect, it } from 'vitest';
import {
  EQUIPS,
  EQUIP_SLOT_LABEL,
  ITEMS,
  MAX_STACK,
  RARITY_COLOR_KEY,
  RARITY_LABEL,
  addConsumable,
  equipItem,
  equipDefOf,
  effectiveStats,
  entryName,
  meetsEquipRequirement,
  migrateEquipItem,
  unequipItem,
  useItem,
} from '../src/items';
import { createFans } from '../src/fans';
import type { EquipCategory, EquipItem, RunState } from '../src/types';

/** 装备类别 → 具体角色槽位（T-022：配置表 slot 是类别，饰品落到 accessory1） */
const slotOf = (category: EquipCategory): 'outfit' | 'hair' | 'haircolor' | 'accessory1' =>
  category === 'accessory' ? 'accessory1' : category;

const T0 = 3 * 1_800_000;

function base(over: Partial<RunState> = {}): RunState {
  return {
    at: T0,
    startedAt: T0,
    stamina: 100,
    money: 6000,
    stats: { vocal: 10, dance: 10, acting: 10, talk: 10 },
    axes: { self: 50, others: 50, fit: 50 },
    mood: 70,
    satiety: 70,
    innate: { height: 160, weight: 60, appearance: 60 },
    negatives: { stress: 0, restless: 0, fatigue: 0, desire: 0, scandal: 0 },
    fans: createFans(0),
    debuted: false,
    parties: [],
    activePartyId: null,
    friends: [],
    inventory: [],
    equipped: {},
    flags: {},
    pendingEvent: null,
    eventQueue: [],
    log: [],
    ...over,
  } as RunState;
}

/** 找一件显性效果包含指定键的消耗品 */
const itemWith = (key: string) => ITEMS.find((i) => typeof i.effects[key] === 'number')!;
const equipWithReq = EQUIPS.find((e) => typeof e.requirement === 'string' && e.requirement.includes('dance >= 15'))!;
const equipWithHidden = EQUIPS.find((e) => Object.keys(e.hidden).length > 0)!;
const medicineWithHidden = ITEMS.find(
  (i) => i.type === 'medicine' && Object.keys(i.hidden).length > 0 && Object.keys(i.negative).length > 0,
)!;

describe('T-019 道具系统', () => {
  it('导入规模与稀有度口径', () => {
    expect(ITEMS.length).toBe(92);
    // T-022：装备槽位改为 服装+发型+发色+饰品×4，鞋袜 11 件删除、发色新增 12 件（67 → 68）
    expect(EQUIPS.length).toBe(68);
    const slotCount: Record<string, number> = {};
    for (const e of EQUIPS) slotCount[e.slot] = (slotCount[e.slot] ?? 0) + 1;
    expect(slotCount.outfit).toBe(30);
    expect(slotCount.hair).toBe(12);
    expect(slotCount.haircolor).toBe(12);
    expect(slotCount.accessory).toBe(14);
    expect(slotCount.shoes).toBeUndefined();
    expect(RARITY_LABEL.legendary).toBe('传说');
    expect(RARITY_COLOR_KEY.rare).toBe('rare');
    expect(EQUIP_SLOT_LABEL.accessory).toBe('饰品');
    expect(EQUIP_SLOT_LABEL.haircolor).toBe('发色');
  });

  it('消耗品堆叠：同 itemId 合并，上限 99', () => {
    let s = base();
    s = addConsumable(s, 'food-bubble-tea');
    s = addConsumable(s, 'food-bubble-tea');
    expect(s.inventory).toHaveLength(1);
    expect(s.inventory[0]!.count).toBe(2);

    let capped = base();
    for (let i = 0; i < MAX_STACK + 5; i += 1) capped = addConsumable(capped, 'food-bubble-tea');
    expect(capped.inventory[0]!.count).toBe(MAX_STACK);
  });

  it('使用消耗品：状态变化 + notice + 数量递减', () => {
    const item = itemWith('mood');
    const s = addConsumable(base({ mood: 50 }), item.id);
    const out = useItem(s, s.inventory[0]!.id);

    expect(out.result).toBe('ok');
    expect(out.state.mood).toBe(Math.min(100, 50 + (item.effects.mood ?? 0)));
    expect(out.notice).toContain('使用了「');
    expect(out.state.inventory).toHaveLength(0); // count 1 → 用完移除
    expect(out.state.log.at(-1)?.actionId).toBe(`use-item:${item.id}`);
  });

  it('消耗品负面效果生效；隐藏效果写进 axes/负向，但日志只写显性部分', () => {
    const s = addConsumable(base(), medicineWithHidden.id);
    const out = useItem(s, s.inventory[0]!.id);
    const hiddenKeys = Object.keys(medicineWithHidden.hidden);

    expect(out.result).toBe('ok');
    // 隐藏效果确实写进了状态（self/others/fit → axes；desire/scandal → 负向）
    const axesChanged = ['self', 'others', 'fit'].some((k) => hiddenKeys.includes(k));
    if (axesChanged) {
      const axes = out.state.axes;
      expect(axes.self !== 50 || axes.others !== 50 || axes.fit !== 50).toBe(true);
    }
    // 日志与 notice 里不出现隐藏属性
    const text = out.state.log.at(-1)!.text + out.notice;
    for (const key of ['self', 'others', 'fit', 'desire', 'scandal']) {
      expect(text).not.toContain(key);
    }
  });

  it('装备要求拦截：不满足返回 requirement，满足后装备生效', () => {
    expect(equipWithReq).toBeTruthy();
    const entry = { id: 'inv-eq-1', itemId: equipWithReq.id, count: 1 };
    const weak = base({ inventory: [entry] });
    expect(meetsEquipRequirement(weak, equipWithReq)).toBe(false);
    expect(equipItem(weak, entry.id).result).toBe('requirement');

    const strong = base({ inventory: [entry], stats: { vocal: 10, dance: 20, acting: 10, talk: 10 } });
    const out = equipItem(strong, entry.id);
    expect(out.result).toBe('ok');
    expect(out.state.equipped[slotOf(equipWithReq.slot)]).toBe(entry.id);

    const eff = effectiveStats(out.state);
    for (const [k, v] of Object.entries(equipWithReq.bonus)) {
      expect(eff[k as keyof typeof eff]).toBe(strong.stats[k as 'vocal' | 'dance' | 'acting' | 'talk'] + v);
    }
  });

  it('四槽互斥：同槽换装自动卸下旧装备（还原旧装备隐形加成）', () => {
    const a = { id: 'inv-a', itemId: EQUIPS.find((e) => e.slot === 'outfit')!.id, count: 1 };
    const b = { id: 'inv-b', itemId: EQUIPS.filter((e) => e.slot === 'outfit')[1]!.id, count: 1 };
    const s = base({ inventory: [a, b], stats: { vocal: 30, dance: 30, acting: 30, talk: 30 } });

    const first = equipItem(s, a.id).state;
    const second = equipItem(first, b.id).state;
    expect(second.equipped.outfit).toBe(b.id);
    // 旧装备的隐形加成已还原、新装备的已生效（只比对方差）
    const baseAxes = base().axes;
    const expectAxes = { ...baseAxes };
    for (const [k, v] of Object.entries(equipDefOf(b)!.hidden)) {
      if (k === 'self' || k === 'others' || k === 'fit') expectAxes[k] = 50 + v;
    }
    expect(second.axes).toEqual(expectAxes);
  });

  it('卸下装备：显性加成消失、隐形加成还原', () => {
    const entry = { id: 'inv-h', itemId: equipWithHidden.id, count: 1 };
    const s = base({
      inventory: [entry],
      stats: { vocal: 50, dance: 50, acting: 50, talk: 50 },
      axes: { self: 50, others: 50, fit: 50 },
    });
    const equipped = equipItem(s, entry.id).state;
    const axesAfterEquip = { ...equipped.axes };

    const { state: after } = unequipItem(equipped, slotOf(equipWithHidden.slot));
    expect(after.equipped[slotOf(equipWithHidden.slot)]).toBeUndefined();
    expect(after.axes).toEqual(s.axes);
    // 装备时 axes 确实变化过（若该装备带隐藏加成）
    if (Object.keys(equipWithHidden.hidden).some((k) => ['self', 'others', 'fit'].includes(k))) {
      expect(axesAfterEquip).not.toEqual(s.axes);
    }
  });

  it('旧档迁移：旧 shop 装备按名称映射；映射不到保留 legacy 原样', () => {
    const oldNamed = EQUIPS[0]!;
    const old: EquipItem = {
      id: 'w0-c0',
      name: oldNamed.name,
      slot: 'outfit',
      rarity: oldNamed.rarity === 'rare' ? 'rare' : 'common',
      price: 800,
      affix: { stat: 'dance', value: 2 },
    };
    const migrated = migrateEquipItem(old, 0);
    expect(migrated.itemId).toBe(oldNamed.id);
    expect(migrated.legacy).toBeUndefined();

    const unknown: EquipItem = { ...old, id: 'w0-x', name: '不存在的旧衣服' };
    const kept = migrateEquipItem(unknown, 1);
    expect(kept.itemId).toBe('');
    expect(kept.legacy?.name).toBe('不存在的旧衣服');
    expect(entryName(kept)).toBe('不存在的旧衣服');
  });

  it('不可使用 / 不可装备的条目有明确结果', () => {
    const equipEntry = { id: 'inv-eq', itemId: EQUIPS[0]!.id, count: 1 };
    const consumeEntry = { id: 'inv-c', itemId: ITEMS[0]!.id, count: 1 };
    expect(useItem(base({ inventory: [equipEntry] }), 'inv-eq').result).toBe('not-usable');
    expect(useItem(base(), 'missing').result).toBe('not-found');
    expect(equipItem(base({ inventory: [consumeEntry] }), 'inv-c').result).toBe('not-equipment');
    expect(equipItem(base(), 'missing').result).toBe('not-found');
  });

  it('旧装备 effectiveStats 兜底（legacy.affix）', () => {
    const legacyItem: EquipItem = {
      id: 'w9-c9',
      name: '不存在',
      slot: 'outfit',
      rarity: 'common',
      price: 1,
      affix: { stat: 'vocal', value: 7 },
    };
    const entry = migrateEquipItem(legacyItem, 0);
    const s = base({ inventory: [entry], equipped: { outfit: entry.id } });
    const eff = effectiveStats(s);
    expect(eff.vocal).toBe(17);
  });

  it('meetsEquipRequirement：无要求视为满足', () => {
    const noReq = EQUIPS.find(
      (e) => typeof e.requirement === 'object' && Object.keys(e.requirement ?? {}).length === 0,
    );
    expect(noReq).toBeTruthy();
    if (noReq) expect(meetsEquipRequirement(base(), noReq)).toBe(true);
  });
});

describe('T-022 饰品四槽与槽位改版', () => {
  const accessories = EQUIPS.filter((e) => e.slot === 'accessory');
  const strong = { vocal: 80, dance: 80, acting: 80, talk: 80 };
  const accEntries = (n: number) =>
    accessories.slice(0, n).map((def, i) => ({ id: `inv-acc-${i}`, itemId: def.id, count: 1 }));

  it('饰品可装 4 件：前 4 次自动填空槽 accessory1..4', () => {
    const list = accEntries(4);
    expect(list).toHaveLength(4);
    let s = base({ stats: { ...strong }, inventory: list });
    const ids = list.map((e) => e.id);

    for (let i = 0; i < 4; i += 1) {
      const out = equipItem(s, ids[i]!);
      expect(out.result).toBe('ok');
      expect(out.state.equipped[`accessory${i + 1}` as 'accessory1']).toBe(ids[i]);
      s = out.state;
    }
    expect(s.equipped.accessory1).toBe(ids[0]);
    expect(s.equipped.accessory4).toBe(ids[3]);
    expect(Object.keys(s.equipped).filter((k) => k.startsWith('accessory'))).toHaveLength(4);
  });

  it('同一件饰品不会同时占两个槽：指定 accessory2 会从 accessory1 移走', () => {
    const list = accEntries(2);
    const s0 = base({ stats: { ...strong }, inventory: list });
    const first = equipItem(s0, list[0]!.id).state; // → accessory1
    expect(first.equipped.accessory1).toBe(list[0]!.id);

    const moved = equipItem(first, list[0]!.id, 'accessory2').state;
    expect(moved.equipped.accessory2).toBe(list[0]!.id);
    expect(moved.equipped.accessory1).toBeUndefined();
  });

  it('卸载任意饰品槽：隐形加成还原', () => {
    const list = accEntries(1);
    const def = equipDefOf({ id: list[0]!.id, itemId: list[0]!.itemId, count: 1 })!;
    const s = base({ stats: { ...strong }, axes: { self: 50, others: 50, fit: 50 }, inventory: list });
    const equipped = equipItem(s, list[0]!.id).state;
    const axesAfter = { ...equipped.axes };
    const { state: after } = unequipItem(equipped, 'accessory1');

    expect(after.equipped.accessory1).toBeUndefined();
    expect(after.axes).toEqual(s.axes);
    if (Object.keys(def.hidden).some((k) => ['self', 'others', 'fit'].includes(k))) {
      expect(axesAfter).not.toEqual(s.axes);
    }
  });

  it('槽位标签：7 槽 + 饰品类别兜底', () => {
    for (const slot of ['outfit', 'hair', 'haircolor', 'accessory1', 'accessory2', 'accessory3', 'accessory4']) {
      expect(EQUIP_SLOT_LABEL[slot]).toBeTruthy();
    }
    expect(EQUIP_SLOT_LABEL.accessory).toBe('饰品');
    expect(EQUIP_SLOT_LABEL.accessory4).toBe('饰品四');
  });
});
