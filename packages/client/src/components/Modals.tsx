import {
  ACTIONS, ACTION_LIST, CATEGORY_LABEL, STAT_LABEL, SHOW_ACTION_ID, previewAction, getStoryEvent, availableChoices, remainingTimes, canShowAction, cooldownLeftDays, type ActionCategory,
} from '@idollife/core';
import type { AppApi } from './api';
import { AuthForm } from './AuthForm';
import { Modal } from './Modal';

/** 弹窗需要的上下文：AppApi + 弹窗专用的临时状态 */
export type ModalCtx = AppApi & Record<string, any>;

export function Modals({ ctx }: { ctx: ModalCtx }) {
  const { doKick, removeItem, activeEventId, setActiveEventId, choose, runId, run, phase, ending, showActions, showDivination, reading, showPartyModal, partyName, confirmAction, showStops, showInvite, kickTarget, forceLogin, showDebug, debugText, setRunId, setRun, setSchedule, setRevision, setNotice, setSyncStatus, setPhase, setEnding, setShowDivination, setShowPartyModal, setPartyName, setConfirmAction, setShowStops, setShowInvite, setKickTarget, setForceLogin, setShowDebug, doStop, doRestart, doInvite, doDivine, savePlan, cancelPlan, addAction, toggleStop, previewRef, dayLabel, biasLabel, party, pending, confirmCreateParty, decide, clearSave, createSave, initialRun, divinationCost } = ctx;

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
      {showActions && (
        <Modal title="安排行程" wide onClose={cancelPlan}>
          <div className="plan">
            <div className="plan-actions">
              {(['growth', 'recover', 'work'] as ActionCategory[]).map((cat) => {
                const list = ACTION_LIST.filter(
                  (a) => a.category === cat && canShowAction(run, a.id),
                );
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="action-group">
                    <h4>{CATEGORY_LABEL[cat]}</h4>
                    <div className="actions">
                      {list.map((a) => {
                        const pv = previewAction(run, a.id);
                        const left = remainingTimes(run, a.id);
                        const statBits = pv
                          ? Object.entries(pv.stats)
                              .map(([k, r]) => `${STAT_LABEL[k] ?? k} +${r[0]}~${r[1]}`)
                              .join(' / ')
                          : '';
                        return (
                          <button
                            key={a.id}
                            onClick={() => addAction(a.id)}
                            disabled={left <= 0}
                            title={left <= 0 ? '次数已用完' : ''}
                          >
                            {a.name}
                            <small>
                              {statBits && `${statBits} · `}
                              {pv && (pv.stamina > 0 ? `体力 +${pv.stamina}` : `体力 ${pv.stamina}`)}
                              {pv && pv.money > 0 ? ` · +¥${pv.money}` : ''}
                              {pv && pv.money < 0 ? ` · ¥${-pv.money}` : ''}
                              {Number.isFinite(left) ? ` · 剩 ${left} 次` : ''}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="plan-preview" ref={previewRef}>
              <div className="plan-preview-head">待执行 {pending.length} 个（已完成的不显示）</div>
              {pending.length === 0 ? (
                <p className="muted small">左边点行动，会加到时间轴末尾。</p>
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
            </div>
          </div>

          <div className="plan-foot">
            <button onClick={cancelPlan}>取消</button>
            <button className="primary" onClick={savePlan}>
              保存安排
            </button>
          </div>
        </Modal>
      )}

      {showDivination && (
        <Modal title="占卜" onClose={() => setShowDivination(false)}>
          {reading ? (
            <div className="reading">
              <p>自我：{reading.self}</p>
              <p>他人：{reading.others}</p>
              <p>适配：{reading.fit}</p>
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
              setRun(initialRun);
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
