import {
  STAT_LABEL, STAMINA_MAX, effectiveStats, canDebut, memberStats, getShop, DEBUT_THRESHOLD, RECRUIT_COST, taskStatus, CHANNELS, cooldownLeftDays,
} from '@idollife/core';
import { Fragment } from 'react';
import type { AppApi, BagTab } from './api';

export function SidePanel({ api }: { api: AppApi }) {
  const { run, rightTab, setRightTab, bagTab, setBagTab, flippedIds, toggleFlip, managing, setManaging, notice, setNotice, doBuy, doEquip, doDebut, setShowDivination, totalFans, statTotal, dayLabel, biasLabel, weekdayName } = api;

  return (
        <aside className="col-right">
          <section className="mod mod-aux">
            <nav className="seg">
              <button
                className={rightTab === 'stats' ? 'seg-item active' : 'seg-item'}
                onClick={() => setRightTab('stats')}
              >
                属性
              </button>
              <button
                className={rightTab === 'bag' ? 'seg-item active' : 'seg-item'}
                onClick={() => setRightTab('bag')}
              >
                背包
              </button>
            </nav>

            {rightTab === 'stats' ? (
              <div className="aux-body">
                <div className="stats">
                  {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                    <div key={k} className="stat">
                      <span className="k">{STAT_LABEL[k]}</span>
                      <span className="v">{run.stats[k]}</span>
                    </div>
                  ))}
                  <div className="stat stat-vital">
                    <span className="k">体力</span>
                    <span className="v">
                      {run.stamina}
                      <em>/{STAMINA_MAX}</em>
                    </span>
                    <span className="stat-bar">
                      <i
                        className={run.stamina <= 20 ? 'low' : undefined}
                        style={{ width: `${Math.round((run.stamina / STAMINA_MAX) * 100)}%` }}
                      />
                    </span>
                  </div>
                  <div className="stat">
                    <span className="k">资金</span>
                    <span className="v">{run.money}</span>
                  </div>
                  <div className="stat">
                    <span className="k">粉丝</span>
                    <span className="v">{totalFans(run)}</span>
                  </div>
                </div>

                <p className="muted small eff">
                  实际属性：
                  {Object.entries(effectiveStats(run))
                    .map(([k, v]) => `${STAT_LABEL[k]} ${v}`)
                    .join(' · ')}
                </p>

                <div className="row">
                  <button
                    className={canDebut(run) ? 'primary' : ''}
                    onClick={doDebut}
                    disabled={!canDebut(run)}
                  >
                    {run.debuted ? '已出道' : `出道 ${statTotal}/${DEBUT_THRESHOLD}`}
                  </button>
                  <button onClick={() => setShowDivination(true)}>占卜</button>
                </div>
              </div>
            ) : (
              <>
                <nav className="crumb">
                  <span className="crumb-root">物品</span>
                  <span className="crumb-sep">›</span>
                  {(['equip', 'consume', 'other'] as BagTab[]).map((t) => (
                    <Fragment key={t}>
                      <button
                        className={bagTab === t ? 'crumb-item active' : 'crumb-item'}
                        onClick={() => setBagTab(t)}
                      >
                        {t === 'equip' ? '装备' : t === 'consume' ? '消耗' : '其他'}
                      </button>
                      {t !== 'other' && <span className="crumb-sep">/</span>}
                    </Fragment>
                  ))}
                </nav>

                {bagTab === 'equip' &&
                  (run.inventory.length === 0 ? (
                    <p className="muted small">还没有装备。</p>
                  ) : (
                    <ul className="shop">
                      {run.inventory.map((item) => {
                        const on = run.equipped.outfit === item.id;
                        return (
                          <li key={item.id}>
                            <span className="name">
                              {item.name}
                              {on ? '（已装备）' : ''}
                            </span>
                            <span className="muted">
                              {STAT_LABEL[item.affix.stat]} +{item.affix.value}
                            </span>
                            <button onClick={() => doEquip(item)} disabled={on}>
                              装备
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ))}

                {(bagTab === 'consume' || bagTab === 'other') && (
                  <p className="muted small">暂无物品。</p>
                )}
              </>
            )}
          </section>
        </aside>
  );
}
