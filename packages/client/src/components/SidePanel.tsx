import type { AppApi } from './api';
import { BagGrid } from './BagGrid';
import { StatsPanel } from './StatsPanel';

export function SidePanel({ api }: { api: AppApi }) {
  const { rightTab, setRightTab } = api;

  return (
    <aside className="col-right">
      <section className="mod mod-aux">
        <nav className="seg">
          <button
            className={rightTab === 'stats' ? 'seg-item active' : 'seg-item'}
            onClick={() => setRightTab('stats')}
          >
            属性
          </button>
          <button
            className={rightTab === 'bag' ? 'seg-item active' : 'seg-item'}
            onClick={() => setRightTab('bag')}
          >
            背包
          </button>
        </nav>

        {rightTab === 'stats' ? (
          <div className="aux-body">
            {/* T-016b：侧栏属性页直接复用 StatsPanel（偶像名→阶段徽章+晋级按钮→固有→状态→成长→…） */}
            {/* T-040：占卜入口从这里去掉（占卜只从主菜单「占卜」页进） */}
            <StatsPanel api={api} embedded />
          </div>
        ) : (
          <BagGrid api={api} />
        )}
      </section>
    </aside>
  );
}
