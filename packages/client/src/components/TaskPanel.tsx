import {
  TASKS,
  activeTasks,
  completedTasks,
  describeCondition,
  describeRewards,
  taskStatus,
  type RunState,
  type TaskDef,
} from '@idollife/core';
import { Fragment } from 'react';

export type TaskTab = 'all' | 'accept' | 'active' | 'done';

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
    const label =
      status === 'claimable'
        ? '可领取'
        : status === 'active'
          ? '进行中'
          : status === 'completable'
            ? '可领奖'
            : status === 'done'
              ? '已完成'
              : '未达成';

    return (
      <li
        key={task.id}
        className={[
          'task',
          status === 'claimable' || status === 'completable' ? 'claimable' : '',
          status === 'done' ? 'done' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="task-top">
          <span className="task-name">{task.name}</span>
          <span className={`task-state ${status}`}>{label}</span>
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
              {status === 'active' ? '已领取' : '领取任务'}
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
            {describeCondition(task.completeCondition)}
          </span>
          <span>
            <em>奖励</em>
            {describeRewards(task)}
          </span>
        </div>
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
      return s === 'claimable' || s === 'completable' || s === 'locked' || s === 'active';
    });
    body =
      list.length === 0 ? (
        <p className="muted small">暂时没有可领取的任务。</p>
      ) : (
        <ul className="task-list">{list.map(renderTask)}</ul>
      );
  } else {
    const sections: Array<{ key: string; title: string; list: TaskDef[] }> = [
      {
        key: 'completable',
        title: '可领奖',
        list: TASKS.filter((task) => taskStatus(run, task) === 'completable'),
      },
      {
        key: 'claimable',
        title: '可领取',
        list: TASKS.filter((task) => taskStatus(run, task) === 'claimable'),
      },
      {
        key: 'active',
        title: '进行中',
        list: TASKS.filter((task) => taskStatus(run, task) === 'active'),
      },
      {
        key: 'locked',
        title: '可见',
        list: TASKS.filter((task) => taskStatus(run, task) === 'locked'),
      },
      {
        key: 'done',
        title: '已完成',
        list: completedTasks(run).map((x) => x.task),
      },
    ];

    const visibleSections = sections.filter((s) => s.list.length > 0);
    body =
      visibleSections.length === 0 ? (
        <p className="muted small">暂时没有任务。</p>
      ) : (
        <>
          {visibleSections.map((sec) => (
            <Fragment key={sec.key}>
              <div className="task-sep">{sec.title}</div>
              <ul className="task-list">{sec.list.map(renderTask)}</ul>
            </Fragment>
          ))}
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
