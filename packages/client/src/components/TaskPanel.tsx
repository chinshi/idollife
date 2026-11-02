import {
  DAILY_SLOTS,
  TASK_CATEGORY_LABEL,
  TASKS,
  activeTasks,
  completedTasks,
  describeCondition,
  describeRewards,
  expiredTimes,
  taskDeadline,
  taskProgress,
  taskStatus,
  type RunState,
  type TaskCategory,
  type TaskDef,
} from '@idollife/core';
import { Fragment } from 'react';

export type TaskTab = 'all' | 'accept' | 'active' | 'done';

/** T-017：任务面板按三类分节 */
const CATEGORY_ORDER: TaskCategory[] = ['guide', 'routine', 'timed'];

export function TaskPanel({
  run,
  tab,
  onTab,
  onAccept,
  onReward,
  dayLabel,
}: {
  run: RunState;
  tab: TaskTab;
  onTab: (t: TaskTab) => void;
  onAccept: (id: string) => void;
  onReward: (id: string) => void;
  dayLabel: (at: number, now: number) => string;
}) {
  const renderTask = (task: TaskDef) => {
    const status = taskStatus(run, task);
    const category: TaskCategory = task.category ?? 'routine';
    const label =
      status === 'claimable'
        ? '可领取'
        : status === 'active'
          ? '进行中'
          : status === 'expired'
            ? '已错过'
            : status === 'completable'
              ? '可领奖'
              : status === 'done'
                ? '已完成'
                : '未达成';

    // 进度：已完成任务不显示进度条（「已完成」页签里进度没有意义，保持列表清爽）；
    // 无进度（复合条件）时自动降级为纯文字条件。
    const progress = status === 'done' ? null : taskProgress(run, task);
    const percent = progress
      ? progress.target > 0
        ? Math.min(100, Math.max(0, (progress.current / progress.target) * 100))
        : 100
      : 0;

    // 倒计时（T-010，R2）：文案按 status 分叉、不按 due 分叉——避免「状态写进行中、倒计时写已超时」。
    // 只在 active / expired 行显示；无限期 / 未领取 / 已完成时 taskDeadline 返回 null → 不渲染占位。
    const deadline =
      status === 'active' || status === 'expired' ? taskDeadline(run, task) : null;
    const deadlineText = !deadline
      ? ''
      : status === 'expired'
        ? '明日起重新可领'
        : deadline.due
          ? '期限已到'
          : deadline.remainingSlots > DAILY_SLOTS
            ? `剩 ${deadline.remainingSlots} 次行动 · 约 ${deadline.remainingDays} 天`
            : `剩 ${deadline.remainingSlots} 次行动`;
    const deadlineTone = !deadline
      ? ''
      : status === 'expired'
        ? 'missed'
        : deadline.due || deadline.remainingSlots <= DAILY_SLOTS
          ? 'urgent'
          : '';

    return (
      <li
        key={task.id}
        className={[
          'task',
          'cat-' + category,
          status === 'claimable' || status === 'completable' ? 'claimable' : '',
          status === 'done' ? 'done' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="task-top">
          <span className="task-name">
            {status === 'completable' ? <em className="task-check">✓</em> : null}
            {task.name}
          </span>
          <span className={`task-state ${status}`}>{label}</span>
          {deadline ? (
            <span
              className={['task-deadline', deadlineTone].filter(Boolean).join(' ')}
              title={`截止：${dayLabel(deadline.deadlineAt, run.at)}`}
            >
              {deadlineText}
            </span>
          ) : null}
          <span className="spacer" />
          {status === 'done' ? (
            <span className="muted small">
              {Number(run.flags[`task:${task.id}:doneAt`] ?? 0) > 0
                ? dayLabel(Number(run.flags[`task:${task.id}:doneAt`]), run.at)
                : '已完成'}
            </span>
          ) : status === 'completable' ? (
            <button className="primary" onClick={() => onReward(task.id)}>
              领取奖励
            </button>
          ) : (
            <button
              className={status === 'claimable' ? 'primary' : ''}
              disabled={status !== 'claimable'}
              onClick={() => onAccept(task.id)}
            >
              {status === 'active' ? '已领取' : status === 'expired' ? '已错过' : '领取任务'}
            </button>
          )}
        </div>

        <p className="task-desc">{task.content}</p>

        <div className="task-req">
          <span>
            <em>可领要求</em>
            {describeCondition(task.acceptCondition)}
          </span>
          <span>
            <em>任务要求</em>
            {progress
              ? `${progress.label} ${progress.current}/${progress.target}`
              : describeCondition(task.completeCondition)}
          </span>
          {task.deadlineDays && task.deadlineDays > 0 ? (
            <span>
              <em>时限</em>
              {task.deadlineDays} 天
            </span>
          ) : null}
          {expiredTimes(run, task.id) > 0 ? (
            <span>
              <em>错过</em>
              {expiredTimes(run, task.id)} 次
            </span>
          ) : null}
          <span>
            <em>奖励</em>
            {describeRewards(task)}
          </span>
        </div>
        {progress ? (
          <div className="task-progress" title={`${progress.current}/${progress.target}`}>
            <span style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </li>
    );
  };

  let body: React.ReactNode;

  if (tab === 'done') {
    const done = completedTasks(run);
    body =
      done.length === 0 ? (
        <p className="muted small">还没有完成的任务。</p>
      ) : (
        <ul className="task-list">{done.map(({ task }) => renderTask(task))}</ul>
      );
  } else if (tab === 'active') {
    const active = activeTasks(run);
    body =
      active.length === 0 ? (
        <p className="muted small">没有进行中的任务。</p>
      ) : (
        <ul className="task-list">{active.map(({ task }) => renderTask(task))}</ul>
      );
  } else if (tab === 'accept') {
    const list = TASKS.filter((task) => {
      const s = taskStatus(run, task);
      return (
        s === 'claimable' ||
        s === 'completable' ||
        s === 'locked' ||
        s === 'active' ||
        s === 'expired'
      );
    });
    body =
      list.length === 0 ? (
        <p className="muted small">暂时没有可领取的任务。</p>
      ) : (
        <ul className="task-list">{list.map(renderTask)}</ul>
      );
  } else {
    // T-017：按三类分节（引导 / 常规 / 限时）；可领奖（completable）置顶；已完成单独一节
    const sections = CATEGORY_ORDER.map((category) => {
      const list = TASKS.filter((task) => (task.category ?? 'routine') === category)
        .map((task) => ({ task, status: taskStatus(run, task) }))
        .filter(({ status }) => status !== 'hidden' && status !== 'done')
        .sort((a, b) => {
          const ca = a.status === 'completable' ? 0 : 1;
          const cb = b.status === 'completable' ? 0 : 1;
          if (ca !== cb) return ca - cb;
          return a.task.priority - b.task.priority;
        })
        .map(({ task }) => task);
      return { key: category, title: TASK_CATEGORY_LABEL[category], list };
    });
    const doneList = completedTasks(run).map((x) => x.task);
    const visibleSections = sections.filter((s) => s.list.length > 0);
    body = (
      <>
        {visibleSections.length === 0 ? <p className="muted small">暂时没有任务。</p> : null}
        {visibleSections.map((sec) => (
          <Fragment key={sec.key}>
            <div className={'task-sep cat-' + sec.key}>{sec.title}</div>
            <ul className="task-list">{sec.list.map(renderTask)}</ul>
          </Fragment>
        ))}
        {doneList.length > 0 ? (
          <>
            <div className="task-sep cat-done">已完成</div>
            <ul className="task-list">{doneList.map(renderTask)}</ul>
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="mod-head">
        <h2>任务</h2>
        <div className="seg-inline">
          {(
            [
              ['all', '全部'],
              ['accept', '领取任务'],
              ['active', '进行中'],
              ['done', '已完成'],
            ] as Array<[TaskTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'seg-item active' : 'seg-item'}
              onClick={() => onTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {body}
    </>
  );
}
