import { Fragment } from 'react';
import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, CHANNELS, TASKS, STAT_LABEL, SHOW_ACTION_ID, activeTasks, completedTasks, describeCondition, describeRewards, taskStatus, canDebut, canShowAction, cooldownLeftDays, effectiveStats, getShop, memberStats, previewAction, remainingTimes, RECRUIT_COST, DEBUT_THRESHOLD, DAY_MS,
} from '@idollife/core';
import type { AppApi, BagTab } from './api';

export function PlanPanel({ api }: { api: AppApi }) {
  const { removeItem, seed, run, party, pending, visibleItems, pastItems, futureItems, nextItem, dayBreakLabels, visibleLog, running, gameNow, remainMs, currentPct, speed, lastStop, stopText, mainTab, setMainTab, taskTab, setTaskTab, friendsTab, setFriendsTab, rightTab, setRightTab, bagTab, setBagTab, logTab, setLogTab, flippedIds, toggleFlip, managing, setManaging, historyLimit, setHistoryLimit, todayIndex, usedToday, statTotal, totalFans, syncStatus, syncText, savedAt, user, notice, setNotice, advance, stopCurrent, openPlan, addShow, doAccept, doReward, doMeet, doInvite, doKick, doBuy, doEquip, doDebut, doSwitchParty, openPartyModal, doDivine, signOut, restartForTest, setShowInvite, setShowDivination, setActiveEventId, setKickTarget, setShowStops, setShowDebug, setDebugText, dayLabel, biasLabel, weekdayName } = api;

  return (
    <>
              <>
                <div className="mod-head">
                  <h2>行程</h2>
                </div>
                {pending.length === 0 ? (
                  <p className="muted small">还没有待执行行程。</p>
                ) : (
                  <ul className="plan-list">
                    {pending.map((s) => {
                      const a = ACTIONS[s.actionId];
                      return (
                        <li key={s.id}>
                          <span className="plan-day">{dayLabel(s.startAt, run.at)}</span>
                          <span className="plan-name">
                            {a?.name ?? (s.actionId === SHOW_ACTION_ID ? '演出' : s.actionId)}
                          </span>
                          <button className="del" onClick={() => removeItem(s.id)}>
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
    </>
  );
}
