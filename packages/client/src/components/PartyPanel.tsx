import { Fragment } from 'react';
import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, CHANNELS, TASKS, STAT_LABEL, SHOW_ACTION_ID, activeTasks, completedTasks, describeCondition, describeRewards, taskStatus, canDebut, canShowAction, cooldownLeftDays, effectiveStats, getShop, memberStats, previewAction, remainingTimes, RECRUIT_COST, DEBUT_THRESHOLD, DAY_MS,
} from '@idollife/core';
import type { AppApi, BagTab } from './api';

export function PartyPanel({ api }: { api: AppApi }) {
  const { removeItem, seed, run, party, pending, visibleItems, pastItems, futureItems, nextItem, dayBreakLabels, visibleLog, running, gameNow, remainMs, currentPct, lastStop, stopText, mainTab, setMainTab, taskTab, setTaskTab, friendsTab, setFriendsTab, rightTab, setRightTab, bagTab, setBagTab, logTab, setLogTab, flippedIds, toggleFlip, managing, setManaging, historyLimit, setHistoryLimit, todayIndex, usedToday, statTotal, totalFans, syncStatus, syncText, savedAt, user, notice, setNotice, advance, stopCurrent, openPlan, doAccept, doReward, doMeet, doInvite, doKick, doBuy, doDebut, doSwitchParty, openPartyModal, doDivine, signOut, restartForTest, setShowInvite, setShowDivination, setActiveEventId, setKickTarget, setShowStops, setShowDebug, setDebugText, dayLabel, biasLabel, weekdayName, busyKey } = api;

  return (
    <>
              <>
                <div className="mod-head">
                  <h2>组合{party ? ` · ${party.name}` : ''}</h2>
                  {run.parties.length > 1 && (
                    <div className="row wrap party-switch">
                      {run.parties.map((p) => (
                        <button
                          key={p.id}
                          className={p.id === run.activePartyId ? 'mini-tab active' : 'mini-tab'}
                          disabled={!!busyKey}
                          onClick={() => doSwitchParty(p.id)}
                        >
                          {busyKey === `switch:${p.id}` ? '切换中…' : p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="spacer" />
                  <button onClick={() => setNotice('组合配置还没做，先留个位置。')}>配置</button>
                  <button onClick={() => setManaging((v) => !v)}>
                    {managing ? '完成' : '管理'}
                  </button>
                  <button onClick={openPartyModal}>{party ? '创建新组合' : '创建组合'}</button>
                </div>

                {!party ? (
                  <p className="muted">
                    {run.debuted ? '还没有组合。先创建一个。' : '出道后才能组建组合。'}
                  </p>
                ) : (
                  <div className="mcards">
                    <div
                      className={flippedIds.includes('__me') ? 'mcard flipped me' : 'mcard me'}
                      onClick={() => toggleFlip('__me')}
                      title="你自己"
                    >
                      <div className="mcard-inner">
                        <div className="mcard-face front">
                          <span className="mcard-name">我</span>
                          <span className="mcard-set">主角</span>
                          <span className="mcard-dup">队长</span>
                        </div>
                        <div className="mcard-face back">
                          <span className="mcard-name">我</span>
                          <div className="mcard-stats">
                            {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                              <span key={k}>
                                <em>{STAT_LABEL[k]}</em>
                                {run.stats[k]}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {party.members.map((m) => {
                      const s = memberStats(m, run.stats);

                      return (
                        <div
                          key={m.id}
                          className={flippedIds.includes(m.id) ? 'mcard flipped' : 'mcard'}
                          onClick={() => {
                            if (!managing) toggleFlip(m.id);
                          }}
                          title="点击翻转查看属性"
                        >
                          {managing && (
                            <button
                              className="mcard-kick"
                              onClick={(e) => {
                                e.stopPropagation();
                                setKickTarget(m.id);
                              }}
                            >
                              退团
                            </button>
                          )}
                          <div className="mcard-inner">
                            <div className="mcard-face front">
                              <span className="mcard-name">{m.name}</span>
                              <span className="mcard-set">{biasLabel(m.bias)}</span>
                              <span className="mcard-dup">默契 +{m.dupCount}%</span>
                            </div>
                            <div className="mcard-face back">
                              <span className="mcard-name">{m.name}</span>
                              <div className="mcard-stats">
                                {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                                  <span key={k}>
                                    <em>{STAT_LABEL[k]}</em>
                                    {s[k]}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div
                      className="mcard invite-card"
                      onClick={() => setShowInvite(true)}
                      title="从朋友圈邀请"
                    >
                      <div className="invite-inner">
                        <span className="plus">＋</span>
                        <span className="hint">点击邀请朋友</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
    </>
  );
}
