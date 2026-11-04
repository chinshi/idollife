import { autoAcceptTasks, type RunState } from '@idollife/core';
import { createSave, normalizeRun } from './save';

/** T-036-r2：登出必须重置内存态（换账号时不继承旧 runId/存档） */
export function buildSignedOutState(initialRun: RunState) {
  const fresh = createSave(autoAcceptTasks(normalizeRun(initialRun)), 'run-demo');
  return {
    runId: fresh.runId,
    run: fresh.run,
    schedule: [],
    revision: 0,
    savedAt: null as number | null,
  };
}
