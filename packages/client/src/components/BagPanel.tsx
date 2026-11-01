import { Fragment } from 'react';
import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, CHANNELS, TASKS, STAT_LABEL, SHOW_ACTION_ID, activeTasks, completedTasks, describeCondition, describeRewards, taskStatus, canDebut, canShowAction, cooldownLeftDays, effectiveStats, getShop, memberStats, previewAction, remainingTimes, RECRUIT_COST, DEBUT_THRESHOLD, DAY_MS,
} from '@idollife/core';
import type { AppApi, BagTab } from './api';

export function BagPanel({ api }: { api: AppApi }) {
  const { removeItem, seed, run, party, pending, visibleItems, pastItems, futureItems, nextItem, dayBreakLabels, visibleLog, running, gameNow, remainMs, currentPct, speed, lastStop, stopText, mainTab, setMainTab, taskTab, setTaskTab, friendsTab, setFriendsTab, rightTab, setRightTab, bagTab, setBagTab, logTab, setLogTab, flippedIds, toggleFlip, managing, setManaging, historyLimit, setHistoryLimit, todayIndex, usedToday, statTotal, totalFans, syncStatus, syncText, savedAt, user, notice, setNotice, advance, stopCurrent, openPlan, addShow, doAccept, doReward, doMeet, doInvite, doKick, doBuy, doEquip, doDebut, doSwitchParty, openPartyModal, doDivine, signOut, restartForTest, setShowInvite, setShowDivination, setActiveEventId, setKickTarget, setShowStops, setShowDebug, setDebugText, dayLabel, biasLabel, weekdayName } = api;

  return (
    <>
              <>
                <div className="mod-head">
                  <h2>背包</h2>
                  <span className="muted small">{run.inventory.length} 件</span>
                </div>
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
                {bagTab === 'equip' && (
                  run.inventory.length === 0 ? (
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
                  )
                )}
                {(bagTab === 'consume' || bagTab === 'other') && (
                  <p className="muted small">暂无物品。</p>
                )}
              </>
    </>
  );
}
