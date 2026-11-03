import { useEffect, useState } from 'react';
import {
  ACTIONS, ACTION_LIST, ACTION_MS, CATEGORY_LABEL, DAILY_SLOTS, DAY_MS, SHOW_ACTION_ID, getStoryEvent, availableChoices, remainingTimes, canShowAction, cooldownLeftDays, type ActionCategory,
} from '@idollife/core';
import type { AppApi } from './api';
import { ActionCard } from './ActionCard';
import { AuthForm } from './AuthForm';
import { Modal } from './Modal';

/** 弹窗需要的上下文：AppApi + 弹窗专用的临时状态 */
export type ModalCtx = AppApi & Record<string, any>;

/**
 * 占卜读数 → 隐性倾向描述（T-016c 用户口径：占卜是唯一看隐藏属性的入口，
 * 但要文案包装、不给数值）。底层 divinationReading 只给 high/mid/low 档位，这里翻成人话。
 */
const AXIS_HINTS: Record<string, Record<'high' | 'mid' | 'low', string>> = {
  self: {
    high: '主见很强，舞台上有自己的主场气场',
    mid: '有自己的主意，也听得进别人的声音',
    low: '容易跟着别人的节奏走',
  },
  others: {
    high: '很在意别人怎么看你',
    mid: '偶尔会留意别人的眼光',
    low: '不太在乎外界眼光',
  },
  fit: {
    high: '镜头缘很好，观众容易记住你',
    mid: '观众缘平平，还需要打磨',
    low: '还没找到和观众相处的感觉',
  },
};
const AXIS_HINT_LABEL: Record<string, string> = { self: '自我倾向', others: '他人倾向', fit: '适配倾向' };

export function Modals({ ctx }: { ctx: ModalCtx }) {
  const { doKick, removeItem, activeEventId, setActiveEventId, choose, runId, run, phase, ending, showActions, showDivination, reading, showPartyModal, partyName, confirmAction, showStops, showInvite, kickTarget, forceLogin, showDebug, debugText, setRunId, commitRun, setSchedule, setRevision, setNotice, setSyncStatus, setPhase, setEnding, setShowDivination, setShowPartyModal, setPartyName, setConfirmAction, setShowStops, setShowInvite, setKickTarget, setForceLogin, setShowDebug, doStop, doRestart, doInvite, doDivine, savePlan, cancelPlan, clearPlan, addAction, toggleStop, dayLabel, biasLabel, party, pending, confirmCreateParty, decide, clearSave, createSave, initialRun, divinationCost, t0, weekdayName } = ctx;

  /** T-023：安排行程的分类折叠（纯 UI，不持久化；每次打开弹窗重置为全展开） */
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (showActions) setCollapsedCats({});
  }, [showActions]);
  const toggleCat = (cat: string) =>
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <>
      {activeEventId &&
        (() => {
          const ev = getStoryEvent(activeEventId);
          if (!ev) return null;
          return (
            <Modal title={ev.major ? '重点事件' : '事件'} onClose={() => setActiveEventId(null)}>
              <h4>{ev.title}</h4>
              <p>{ev.text}</p>
              <div className="choices">
                {availableChoices(run, activeEventId).map((c) => (
                  <button key={c.id} onClick={() => void choose(activeEventId, c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Modal>
          );
        })()}
      {confirmAction && (
        <Modal
          title={confirmAction === 'stop' ? '停止当前行程' : '重新开始'}
          onClose={() => setConfirmAction(null)}
        >
          {confirmAction === 'stop' ? (
            <p>
              只作废正在进行的那条行动（不结算），时间回到它开始前。
              <br />
              其余没开始的行程会保留。
            </p>
          ) : (
            <p>会清空本地存档并新建一局，确定吗？</p>
          )}
          <div className="row">
            <button onClick={() => setConfirmAction(null)}>取消</button>
            <button
              className="primary"
              onClick={confirmAction === 'stop' ? doStop : doRestart}
            >
              确定
            </button>
          </div>
        </Modal>
      )}
      {kickTarget && (
        <Modal title="请离成员" onClose={() => setKickTarget(null)}>
          <p>如果请离了该成员，可能对于团会产生不好的影响，且一个月内无法重新入团。</p>
          <div className="row">
            <button onClick={() => setKickTarget(null)}>取消</button>
            <button
              className="primary"
              onClick={() => {
                doKick(kickTarget);
                setKickTarget(null);
              }}
            >
              确认请离
            </button>
          </div>
        </Modal>
      )}
      {showInvite && (
        <Modal title="邀请朋友" onClose={() => setShowInvite(false)}>
          <p className="muted small">无团的朋友可以邀请；已有组合的人需要先移出原组合。</p>
          {run.friends.length === 0 ? (
            <p className="muted">朋友圈还是空的，先去「朋友圈」认识几个人。</p>
          ) : (
            <ul className="invite-list">
              {[...run.friends]
                .sort(
                  (a, b) =>
                    Number(!!a.partyId || cooldownLeftDays(run, a) > 0) -
                    Number(!!b.partyId || cooldownLeftDays(run, b) > 0),
                )
                .map((f) => {
                  const team = f.partyId
                    ? run.parties.find((x) => x.id === f.partyId)?.name
                    : null;
                  const cool = cooldownLeftDays(run, f);
                  const blocked = !!f.partyId || cool > 0;
                  return (
                    <li key={f.id} className={blocked ? 'owned' : ''}>
                      <span className="name">{f.name}</span>
                      <span className="meta">
                        {biasLabel(f.bias)} · 资质 {Math.round(f.quality * 100)}%
                      </span>
                      {team && <span className="team">已归属 · {team}</span>}
                      {!team && cool > 0 && (
                        <span className="team">冷却中 · 剩余 {cool} 天</span>
                      )}
                      <span className="spacer" />
                      <button disabled={blocked || !party} onClick={() => doInvite(f.id)}>
                        {f.partyId ? '不可邀请' : cool > 0 ? `冷却 ${cool} 天` : '邀请'}
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </Modal>
      )}
      {showStops && (
        <Modal title="设置暂停时间点" onClose={() => setShowStops(false)}>
          <p className="muted small">点一条行程：推进到它完成后就停下，方便你中途回来看看。</p>
          {pending.length === 0 ? (
            <p className="muted">还没有待执行行程。</p>
          ) : (
            <ul className="stop-list">
              {pending.map((s, i) => {
                const a = ACTIONS[s.actionId];
                return (
                  <li key={s.id} className={s.stopAfter ? 'on' : ''}>
                    <button onClick={() => toggleStop(s.id)}>
                      <span className="idx">{i + 1}</span>
                      <span className="nm">{a?.name ?? s.actionId}</span>
                      <span className="when">{dayLabel(s.startAt, run.at)}</span>
                      {s.stopAfter && <em>完成后停止</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}
      {showActions &&
        (() => {
          // T-021：每天 3 个行动位；从「当前游戏日」起找第一个还有空位的可排日，连续 8 天（每行 4 个、两行）
          const byDay = new Map<number, typeof pending>();
          for (const s of pending) {
            const d = Math.floor((s.startAt - t0) / DAY_MS);
            const list = byDay.get(d) ?? [];
            list.push(s);
            byDay.set(d, list);
          }
          const usedSlots = (d: number) =>
            (byDay.get(d) ?? []).reduce(
              (n, s) =>
                n +
                Math.max(
                  1,
                  Math.ceil(
                    ((ACTIONS[s.actionId]?.durationMs ?? ACTION_MS) as number) / ACTION_MS,
                  ),
                ),
              0,
            );

          const currentDay = Math.floor((run.at - t0) / DAY_MS);
          let startDay = currentDay;
          for (let i = 0; i < 30; i += 1) {
            const d = currentDay + i;
            if (usedSlots(d) < DAILY_SLOTS) {
              startDay = d;
              break;
            }
          }
          const days = Array.from({ length: 8 }, (_, i) => startDay + i);
          return (
            <Modal title="安排行程" wide dismissOnMask={false} onClose={cancelPlan}>
              <div className="plan">
                <div className="plan-actions">
                  {(['growth', 'recover', 'work'] as ActionCategory[]).map((cat) => {
                    const list = ACTION_LIST.filter(
                      (a) => a.category === cat && canShowAction(run, a.id),
                    );
                    if (list.length === 0) return null;
                    const collapsed = !!collapsedCats[cat];
                    return (
                      <div key={cat} className="action-group">
                        <button
                          type="button"
                          className={collapsed ? 'action-group-head collapsed' : 'action-group-head'}
                          onClick={() => toggleCat(cat)}
                          aria-expanded={!collapsed}
                        >
                          <span className="group-caret">{collapsed ? '▸' : '▾'}</span>
                          <span className="group-name">{CATEGORY_LABEL[cat]}</span>
                          <span className="group-count">{list.length}</span>
                        </button>
                        {collapsed ? null : (
                          <div className="actions">
                            {list.map((a) => (
                              <ActionCard
                                key={a.id}
                                run={run}
                                action={a}
                                left={remainingTimes(run, a.id)}
                                onAdd={() => addAction(a.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="plan-grid-wrap">
                  <div className="plan-grid-head">
                    <span>待执行 {pending.length} 个</span>
                    <button className="clear-plan" onClick={clearPlan}>
                      清空全部
                    </button>
                  </div>

                  <div className="date-grid">
                    {days.map((day) => {
                      const items = byDay.get(day) ?? [];
                      const used = items.reduce(
                        (n, s) => n + Math.max(1, Math.ceil(((ACTIONS[s.actionId]?.durationMs ?? ACTION_MS) as number) / ACTION_MS)),
                        0,
                      );
                      const empty = Math.max(0, DAILY_SLOTS - used);
                      return (
                        <div className="date-cell" key={day}>
                          <div className="date-head">
                            第 {Math.floor(day / 7) + 1} 周 {weekdayName(day)}
                          </div>
                          <div className="date-slots">
                            {items.map((s) => (
                              <div className="date-slot" key={s.id}>
                                <span className="nm">
                                  {ACTIONS[s.actionId]?.name ??
                                    (s.actionId === SHOW_ACTION_ID ? '演出' : s.actionId)}
                                </span>
                                <button className="del" title="删除这一条" onClick={() => removeItem(s.id)}>
                                  ⊗
                                </button>
                              </div>
                            ))}
                            {Array.from({ length: empty }).map((_, i) => (
                              <div className="date-slot empty" key={`e${i}`}>
                                空
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="muted small plan-grid-hint">点左侧行动 → 按时间顺序填入下一个空槽；⊗ 单独删除。</p>
                </div>
              </div>

              <div className="plan-foot">
                <button onClick={cancelPlan}>取消</button>
                <button className="primary" onClick={savePlan}>
                  保存安排
                </button>
              </div>
            </Modal>
          );
        })()}

      {showDivination && (
        <Modal title="占卜" onClose={() => setShowDivination(false)}>
          {reading ? (
            <div className="reading">
              {(['self', 'others', 'fit'] as const).map((k) => {
                const tier = (reading as Record<string, string>)[k];
                const hint = tier && AXIS_HINTS[k] ? AXIS_HINTS[k][tier as 'high' | 'mid' | 'low'] : undefined;
                return (
                  <p key={k}>
                    {AXIS_HINT_LABEL[k]}：{hint ?? '卦象不明'}
                  </p>
                );
              })}
            </div>
          ) : (
            <p className="muted">还没占过。占卜能看到你现在的状态倾向。</p>
          )}
          <div className="row">
            <button className="primary" onClick={doDivine} disabled={run.money < divinationCost(run)}>
              占一卦
              <small>-{divinationCost(run)}</small>
            </button>
          </div>
        </Modal>
      )}

      {showPartyModal && (
        <Modal title="创建组合" onClose={() => setShowPartyModal(false)}>
          <label className="field">
            <span>组合名</span>
            <input
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder={`组合 ${run.parties.length + 1}`}
            />
          </label>
          <div className="row">
            <button className="primary" onClick={confirmCreateParty}>
              创建
            </button>
          </div>
        </Modal>
      )}

      {phase === 'deciding' && (
        <Modal title="两年了">
          <h4>你还要留在这个圈子吗？</h4>
          <div className="choices">
            <button onClick={() => decide('stay')}>留在台前</button>
            <button onClick={() => decide('backstage')}>转幕后</button>
            <button onClick={() => decide('leave')}>离开</button>
          </div>
        </Modal>
      )}

      {phase === 'ended' && ending && (
        <Modal title="结局">
          <h4 className="ending-title">{ending.title}</h4>
          <p>{ending.text}</p>
          <button
            className="primary"
            onClick={() => {
              clearSave();
              const fresh = createSave(initialRun, 'run-demo');
              setRunId(fresh.runId);
              // T-020：重置也要走 App 的统一提交口（同步 runRef，避免时钟 tick 用旧底稿覆盖）
              commitRun(initialRun);
              setSchedule([]);
              setRevision(0);
              setEnding(null);
              setPhase('playing');
            }}
          >
            再来一次
          </button>
        </Modal>
      )}

      {showDebug && (
        <Modal title="调试日志" onClose={() => setShowDebug(false)}>
          <pre className="debug-pre">{debugText}</pre>
          <div className="row">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(debugText);
                setNotice('日志已复制');
              }}
            >
              复制
            </button>
          </div>
        </Modal>
      )}

      {forceLogin && (
        <Modal title="登录已过期，请重新登录">
          <AuthForm
            submitLabel="继续"
            onDone={() => {
              setForceLogin(false);
              setSyncStatus('local');
            }}
          />
        </Modal>
      )}
    </>
  );
}
