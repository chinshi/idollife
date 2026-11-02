import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  RARITY_COLOR_KEY,
  RARITY_LABEL,
  STAT_LABEL,
  describeCondition,
  consumeDefOf,
  equipBonusLines,
  equipDefOf,
  entryName,
  entryRarity,
  entryTypeLabel,
  meetsEquipRequirement,
  visibleEffectLines,
  type EquipSlot,
  type InventoryEntry,
  type RunState,
} from '@idollife/core';
import type { AppApi } from './api';

/**
 * 背包格子（T-019）：BagPanel 与 SidePanel 背包页签共用同一实现。
 *
 * - 格子：56px 方块 + 稀有度边框 + 名称首字 icon + 数量角标 + 装备中「E」标
 * - hover：portal 到 body 的黑色半透明 tooltip（三段：名称/显性效果/文案），
 *   隐藏效果（self/others/fit/desire/scandal）数值**绝不显示**
 * - 点击：消耗品直接使用；装备点一下装备、再点卸下
 */
const RARITY_CLASS: Record<string, string> = {
  common: 'rar-common',
  uncommon: 'rar-uncommon',
  rare: 'rar-rare',
  legendary: 'rar-legendary',
};

const EFFECT_LABEL: Record<string, string> = {
  stamina: '体力',
  mood: '心情',
  satiety: '饱腹',
  weight: '体重',
  appearance: '样貌',
  fatigue: '积劳',
  stress: '精神压力',
  restless: '焦躁',
  desire: '欲望',
  scandal: '丑闻',
  vocal: '唱功',
  dance: '舞蹈',
  acting: '演技',
  talk: '谈吐',
};

const labelOf = (key: string) =>
  EFFECT_LABEL[key] ?? STAT_LABEL[key as keyof typeof STAT_LABEL] ?? key;

function slotOf(entry: InventoryEntry): EquipSlot | null {
  const def = equipDefOf(entry);
  if (def) return def.slot;
  return entry.legacy ? 'outfit' : null;
}

function isEquipped(run: RunState, entry: InventoryEntry): boolean {
  const slot = slotOf(entry);
  return !!slot && run.equipped?.[slot] === entry.id;
}

export function BagGrid({ api }: { api: AppApi }) {
  const { run, bagTab, setBagTab, doUseItem, doEquipBag, doUnequipBag } = api;

  const [tip, setTip] = useState<{ entry: InventoryEntry; top: number; left: number; below: boolean } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const clearTimer = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const openTip = (entry: InventoryEntry, el: HTMLButtonElement) => {
    clearTimer();
    const r = el.getBoundingClientRect();
    const W = 248;
    const H = 150;
    const gap = 8;
    const below = window.innerHeight - r.bottom < H + 16 && r.top > H + 16;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8);
    setTip({ entry, top: below ? r.bottom + gap : Math.max(8, r.top - H - gap), left, below });
  };
  const closeTipSoon = () => {
    clearTimer();
    hideTimer.current = window.setTimeout(() => setTip(null), 140);
  };
  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const entries = (run.inventory ?? []).filter((entry) => {
    const equip = !!equipDefOf(entry) || !!entry.legacy;
    const consume = !!consumeDefOf(entry);
    if (bagTab === 'equip') return equip;
    if (bagTab === 'consume') return consume;
    return false;
  });

  const tabs: Array<[typeof bagTab, string]> = [
    ['equip', '装备'],
    ['consume', '消耗'],
    ['other', '其他'],
  ];

  const renderCell = (entry: InventoryEntry) => {
    const def = consumeDefOf(entry);
    const equipDef = equipDefOf(entry);
    const rarity = entryRarity(entry);
    const name = entryName(entry);
    const equipped = isEquipped(run, entry);
    const slot = slotOf(entry);
    return (
      <button
        key={entry.id}
        ref={(el) => {
          cellRefs.current[entry.id] = el;
        }}
        type="button"
        className={[
          'bag-cell',
          RARITY_CLASS[RARITY_COLOR_KEY[rarity]] ?? 'rar-common',
          equipped ? 'equipped' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={(e) => openTip(entry, e.currentTarget)}
        onMouseLeave={closeTipSoon}
        onClick={() => {
          if (def) doUseItem(entry.id);
          else if (equipDef && slot) {
            if (equipped) doUnequipBag(slot);
            else doEquipBag(entry.id);
          }
        }}
      >
        <span className="bag-icon">{name.trim().slice(0, 1)}</span>
        {entry.count > 1 ? <span className="bag-count">×{entry.count}</span> : null}
        {equipped ? <span className="bag-e">E</span> : null}
      </button>
    );
  };

  const tipEntry = tip?.entry;
  const tipEquip = tipEntry ? equipDefOf(tipEntry) : null;
  const tipRarity = tipEntry ? entryRarity(tipEntry) : 'common';
  const conditionOk = tipEquip ? meetsEquipRequirement(run, tipEquip) : true;

  return (
    <>
      <nav className="crumb">
        <span className="crumb-root">物品</span>
        <span className="crumb-sep">›</span>
        {tabs.map(([t, label]) => (
          <Fragment key={t}>
            <button
              className={bagTab === t ? 'crumb-item active' : 'crumb-item'}
              onClick={() => setBagTab(t)}
            >
              {label}
            </button>
            {t !== 'other' && <span className="crumb-sep">/</span>}
          </Fragment>
        ))}
      </nav>

      {bagTab === 'other' ? (
        <p className="muted small">敬请期待。</p>
      ) : entries.length === 0 ? (
        <p className="muted small">{bagTab === 'equip' ? '还没有装备。' : '还没有消耗品。'}</p>
      ) : (
        <div className="bag-grid">{entries.map(renderCell)}</div>
      )}

      {tip && tipEntry
        ? createPortal(
            <div
              className={tip.below ? 'item-tip below' : 'item-tip above'}
              style={{ top: tip.top, left: tip.left }}
              onMouseEnter={clearTimer}
              onMouseLeave={closeTipSoon}
            >
              <div className="item-tip-head">
                <span className="item-tip-name" style={{ color: `var(--rarity-${RARITY_COLOR_KEY[tipRarity]})` }}>
                  {entryName(tipEntry)}
                </span>
                <span className="item-tip-meta">
                  {RARITY_LABEL[tipRarity]} · {entryTypeLabel(tipEntry)}
                </span>
              </div>

              <div className="item-tip-effects">
                {/* 消耗品：显性 + 负面（隐藏属性已被 visibleEffectLines 过滤掉） */}
                {!tipEquip
                  ? visibleEffectLines(tipEntry).map(({ key, delta }) => (
                      <div key={key} className={delta >= 0 ? 'eff-up' : 'eff-down'}>
                        {labelOf(key)} {delta >= 0 ? '+' : ''}
                        {delta}
                      </div>
                    ))
                  : null}
                {/* 装备：显性加成 + 装备要求（不满足红字） */}
                {tipEquip
                  ? equipBonusLines(tipEquip).map(({ key, delta }) => (
                      <div key={key} className={delta >= 0 ? 'eff-up' : 'eff-down'}>
                        {labelOf(key)} {delta >= 0 ? '+' : ''}
                        {delta}
                      </div>
                    ))
                  : null}
                {tipEquip && tipEquip.requirement ? (
                  <div className={conditionOk ? 'eff-req' : 'eff-req bad'}>
                    需要：{describeCondition(tipEquip.requirement)}
                  </div>
                ) : null}
                {!tipEquip && tipEntry.legacy ? (
                  <div className={tipEntry.legacy.affix.value >= 0 ? 'eff-up' : 'eff-down'}>
                    {labelOf(tipEntry.legacy.affix.stat)} +{tipEntry.legacy.affix.value}
                  </div>
                ) : null}
              </div>

              <div className="item-tip-text">
                {tipEquip?.text ?? consumeDefOf(tipEntry)?.text ?? tipEntry.legacy?.name ?? ''}
                {tipEquip?.hiddenText ? (
                  <>
                    <br />
                    <em className="item-tip-hidden">{tipEquip.hiddenText}</em>
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
