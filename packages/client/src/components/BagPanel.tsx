import { BagGrid } from './BagGrid';
import type { AppApi } from './api';

/** 背包（T-019 格子化）：主界面「背包」页签；与侧栏背包共用 BagGrid */
export function BagPanel({ api }: { api: AppApi }) {
  return (
    <>
      <div className="mod-head">
        <h2>背包</h2>
        <span className="muted small">{api.run.inventory.length} 件</span>
      </div>
      <BagGrid api={api} />
    </>
  );
}
