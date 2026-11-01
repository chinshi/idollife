import { Fragment } from 'react';
import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, CHANNELS, TASKS, STAT_LABEL, SHOW_ACTION_ID, activeTasks, completedTasks, describeCondition, describeRewards, taskStatus, canDebut, canShowAction, cooldownLeftDays, effectiveStats, getShop, memberStats, previewAction, remainingTimes, RECRUIT_COST, DEBUT_THRESHOLD, DAY_MS,
} from '@idollife/core';
import type { AppApi, BagTab } from './api';

export function StatsPanel({ api }: { api: AppApi }) {
  const { removeItem, seed, run, party, pending, visibleItems, pastItems, futureItems, nextItem, dayBreakLabels, visibleLog, running, gameNow, remainMs, currentPct, speed, lastStop, stopText, mainTab, setMainTab, taskTab, setTaskTab, friendsTab, setFriendsTab, rightTab, setRightTab, bagTab, setBagTab, logTab, setLogTab, flippedIds, toggleFlip, managing, setManaging, historyLimit, setHistoryLimit, todayIndex, usedToday, statTotal, totalFans, syncStatus, syncText, savedAt, user, notice, setNotice, advance, stopCurrent, openPlan, addShow, doAccept, doReward, doMeet, doInvite, doKick, doBuy, doEquip, doDebut, doSwitchParty, openPartyModal, doDivine, signOut, restartForTest, setShowInvite, setShowDivination, setActiveEventId, setKickTarget, setShowStops, setShowDebug, setDebugText, dayLabel, biasLabel, weekdayName } = api;

  return (
    <>
              <>
                <div className="mod-head">
                  <h2>属性</h2>
                </div>
                <div className="stats big">
                  {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                    <div key={k} className="stat">
                      <span className="k">{STAT_LABEL[k]}</span>
                      <span className="v">{run.stats[k]}</span>
                    </div>
                  ))}
                  <div className="stat">
                    <span className="k">体力</span>
                    <span className="v">{run.stamina}</span>
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
                <p className="muted small">
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
              </>
    </>
  );
}
