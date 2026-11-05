import { ITEMS, RARITY_LABEL, STAT_LABEL, getShop, type Rarity } from '@idollife/core';
import type { AppApi } from './api';

/**
 * 商店（T-019）：
 * - 装备货架：沿用旧 shop 表（本周货架按 seed 确定性生成，卡面禁止整体迁移）
 * - 便利店：临时获取入口，只上架 common/uncommon 消耗品（按参考价），rare/legendary 不上架
 */
const EFFECT_LABEL: Record<string, string> = {
  stamina: '体力',
  mood: '心情',
  stress: '压力',
  weight: '体重',
  appearance: '样貌',
  fatigue: '积劳',
};

export function ShopPanel({ api }: { api: AppApi }) {
  const { seed, run, doBuy, doBuyConsumable, busyKey } = api;

  const convItems = ITEMS.filter((i) => i.rarity === 'common' || i.rarity === 'uncommon');
  const RARITY_TEXT: Record<Rarity, string> = {
    common: '普通',
    uncommon: '常见',
    rare: '稀有',
    legendary: '传说',
  };

  return (
    <>
      <div className="mod-head">
        <h2>商店</h2>
        <span className="muted small">装备 {run.inventory.length} 件</span>
      </div>
      <ul className="shop">
        {getShop(run, seed).map((item) => (
          <li key={item.id}>
            <span className="name">{item.name}</span>
            <span className="muted">
              {STAT_LABEL[item.affix.stat]} +{item.affix.value}
              {item.rarity === 'rare' ? ' · 稀有' : ''}
            </span>
            <button
              onClick={() => doBuy(item)}
              disabled={run.money < item.price || !!busyKey}
            >
              {busyKey === `buy:${item.id}` ? '购买中…' : `¥${item.price}`}
            </button>
          </li>
        ))}
      </ul>

      <div className="shop-sep">便利店</div>
      <p className="muted small">便利店的货架（临时获取入口；稀有/传说暂不上架）。</p>
      <ul className="shop">
        {convItems.map((item) => (
          <li key={item.id}>
            <span className="name">
              {item.name}
              <em className={`rar-tag rar-${item.rarity}`}>{RARITY_TEXT[item.rarity]}</em>
            </span>
            <span className="muted">
              {item.type === 'food' ? '食物' : '药品'}
              {Object.entries(item.effects)
                .filter(([k]) => !['self', 'others', 'fit', 'desire', 'scandal'].includes(k))
                .map(([k, v]) => `${EFFECT_LABEL[k] ?? k} ${v > 0 ? '+' : ''}${v}`)
                .join(' · ')}
            </span>
            <button
              onClick={() => doBuyConsumable(item.id)}
              disabled={run.money < item.price || !!busyKey}
            >
              {busyKey === `consume:${item.id}` ? '购买中…' : `¥${item.price}`}
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">
        {RARITY_LABEL.common} / {RARITY_LABEL.uncommon} 上架中。
      </p>
    </>
  );
}
