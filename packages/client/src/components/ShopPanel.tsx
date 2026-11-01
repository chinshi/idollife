import { Fragment } from 'react';
import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, CHANNELS, TASKS, STAT_LABEL, SHOW_ACTION_ID, activeTasks, completedTasks, describeCondition, describeRewards, taskStatus, canDebut, canShowAction, cooldownLeftDays, effectiveStats, getShop, memberStats, previewAction, remainingTimes, RECRUIT_COST, DEBUT_THRESHOLD, DAY_MS,
} from '@idollife/core';
import type { AppApi, BagTab } from './api';

export function ShopPanel({ api }: { api: AppApi }) {
  const { removeItem, seed, run, party, pending, visibleItems, pastItems, futureItems, nextItem, dayBreakLabels, visibleLog, running, gameNow, remainMs, currentPct, speed, lastStop, stopText, mainTab, setMainTab, taskTab, setTaskTab, friendsTab, setFriendsTab, rightTab, setRightTab, bagTab, setBagTab, logTab, setLogTab, flippedIds, toggleFlip, managing, setManaging, historyLimit, setHistoryLimit, todayIndex, usedToday, statTotal, totalFans, syncStatus, syncText, savedAt, user, notice, setNotice, advance, stopCurrent, openPlan, addShow, doAccept, doReward, doMeet, doInvite, doKick, doBuy, doEquip, doDebut, doSwitchParty, openPartyModal, doDivine, signOut, restartForTest, setShowInvite, setShowDivination, setActiveEventId, setKickTarget, setShowStops, setShowDebug, setDebugText, dayLabel, biasLabel, weekdayName } = api;

  return (
    <>
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
                      <button onClick={() => doBuy(item)} disabled={run.money < item.price}>
                        ¥{item.price}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
    </>
  );
}
