import { STAMINA_MAX, attrValue, type RunState } from '@idollife/core';

/**
 * T-021：时间轴右侧状态栏（200px）——资金 + 体力/心情/饱腹/健康四条状态条 + 异常状态标签占位。
 * 异常状态系统后续立卡，本单只渲染占位「无所事事」+ 容器样式钩子。
 */
const VITALS: Array<{ key: string; label: string; max: number }> = [
  { key: 'stamina', label: '体力', max: STAMINA_MAX },
  { key: 'mood', label: '心情', max: 100 },
  { key: 'satiety', label: '饱腹', max: 100 },
  { key: 'health', label: '健康', max: 100 },
];

const toneOf = (value: number) => (value < 15 ? 'danger' : value < 30 ? 'warn' : '');

export function TimelineStatus({ run }: { run: RunState }) {
  return (
    <aside className="mod tl-status bar-card">
      <div className="tl-money">
        <span className="k">资金</span>
        <span className="v">{Math.round(run.money).toLocaleString('zh-CN')}</span>
      </div>

      <div className="tl-vitals">
        {VITALS.map((v) => {
          const value = Math.round(attrValue(run, v.key));
          const pct = Math.max(0, Math.min(100, (value / v.max) * 100));
          return (
            <div key={v.key} className="tl-vital">
              <div className="tl-vital-row">
                <span className="k">{v.label}</span>
                <span className="v">{value}</span>
              </div>
              <span className={`tl-vital-bar ${toneOf((value / v.max) * 100)}`}>
                <i style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="tl-abnormal">
        <div className="tl-abnormal-head">异常状态</div>
        <span className="abnormal-tag">无所事事</span>
      </div>
    </aside>
  );
}
