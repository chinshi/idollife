import { Fragment } from 'react';
import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, CHANNELS, TASKS, STAT_LABEL, SHOW_ACTION_ID, activeTasks, completedTasks, describeCondition, describeRewards, taskStatus, canDebut, canShowAction, cooldownLeftDays, effectiveStats, getShop, memberStats, previewAction, remainingTimes, RECRUIT_COST, DEBUT_THRESHOLD, DAY_MS,
} from '@idollife/core';
import type { AppApi, BagTab } from './api';

export function FriendsPanel({ api }: { api: AppApi }) {
  const { removeItem, seed, run, party, pending, visibleItems, pastItems, futureItems, nextItem, dayBreakLabels, visibleLog, running, gameNow, remainMs, currentPct, speed, lastStop, stopText, mainTab, setMainTab, taskTab, setTaskTab, friendsTab, setFriendsTab, rightTab, setRightTab, bagTab, setBagTab, logTab, setLogTab, flippedIds, toggleFlip, managing, setManaging, historyLimit, setHistoryLimit, todayIndex, usedToday, statTotal, totalFans, syncStatus, syncText, savedAt, user, notice, setNotice, advance, stopCurrent, openPlan, addShow, doAccept, doReward, doMeet, doInvite, doKick, doBuy, doEquip, doDebut, doSwitchParty, openPartyModal, doDivine, signOut, restartForTest, setShowInvite, setShowDivination, setActiveEventId, setKickTarget, setShowStops, setShowDebug, setDebugText, dayLabel, biasLabel, weekdayName } = api;

  return (
    <>
              <>
                <div className="mod-head">
                  <h2>朋友圈</h2>
                  <span className="seg-inline">
                    <button
                      className={friendsTab === 'list' ? 'seg-item active' : 'seg-item'}
                      onClick={() => setFriendsTab('list')}
                    >
                      我的朋友圈
                    </button>
                    <button
                      className={friendsTab === 'meet' ? 'seg-item active' : 'seg-item'}
                      onClick={() => setFriendsTab('meet')}
                    >
                      认识新朋友
                    </button>
                  </span>
                  <span className="spacer" />
                  <span className="muted small">
                    共 {run.friends.length} 人 · 可邀请 {run.friends.filter((f) => !f.partyId).length}
                  </span>
                </div>

                <div
                  className="friend-block"
                  style={{ display: friendsTab === 'meet' ? undefined : 'none' }}
                >
                  <h4>认识新朋友</h4>
                  <div className="row wrap">
                    {CHANNELS.map((c) => (
                      <button
                        key={c.id}
                        className={run.money < c.cost ? 'meet-poor' : ''}
                        onClick={() => doMeet(c.id)}
                        title={c.text}
                      >
                        {c.name}
                        <small>¥{c.cost}</small>
                      </button>
                    ))}
                  </div>

                  <div className="meet-log-wrap">
                    <div className="meet-log-head">抽取记录</div>
                    <ul className="meet-log">
                      {run.log
                        .filter((l) => l.actionId.startsWith('meet:'))
                        .slice(-30)
                        .reverse()
                        .map((l, i) => (
                          <li key={`${l.at}-${i}`}>{l.text}</li>
                        ))}
                      {run.log.filter((l) => l.actionId.startsWith('meet:')).length === 0 && (
                        <li className="muted">还没有抽取记录</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div
                  className="friend-block"
                  style={{ display: friendsTab === 'list' ? undefined : 'none' }}
                >
                  <h4>我的朋友圈</h4>
                  {run.friends.length === 0 ? (
                    <p className="muted small">还没有认识的人，去上面挑个渠道试试。</p>
                  ) : (
                    <div className="mcards">
                      {run.friends.map((f) => {
                        const on = flippedIds.includes(`f:${f.id}`);
                        const inParty = !!f.partyId;
                        const teamName = f.partyId
                          ? run.parties.find((x) => x.id === f.partyId)?.name
                          : null;
                        return (
                          <div
                            key={f.id}
                            className={[
                              'mcard',
                              'friend',
                              on ? 'flipped' : '',
                              inParty ? 'in-team' : '',
                              !inParty && cooldownLeftDays(run, f) > 0 ? 'cooling' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => toggleFlip(`f:${f.id}`)}
                            title={inParty ? `已在「${teamName}」` : '点击翻转查看预估属性'}
                          >
                            <div className="mcard-inner">
                              <div className="mcard-face front">
                                <span className="mcard-name">{f.name}</span>
                                <span className="mcard-set">
                                  {biasLabel(f.bias)} · 资质 {Math.round(f.quality * 100)}%
                                </span>
                                <span className="mcard-dup">默契 +{f.dupCount ?? 0}%</span>
                                {inParty && <span className="mcard-team">已入团 · {teamName}</span>}
                                {!inParty && cooldownLeftDays(run, f) > 0 && (
                                  <span className="mcard-cool">
                                    冷却中 · 剩余 {cooldownLeftDays(run, f)} 天
                                  </span>
                                )}

                              </div>
                              <div className="mcard-face back">
                                <span className="mcard-name">{f.name}</span>
                                <div className="mcard-stats">
                                  {(['vocal', 'dance', 'acting', 'talk'] as const).map((k) => (
                                    <span key={k}>
                                      <em>{STAT_LABEL[k]}</em>
                                      {Math.round(run.stats[k] * f.quality)}
                                    </span>
                                  ))}
                                </div>
                                <span className="mcard-dup">预估属性</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
    </>
  );
}
