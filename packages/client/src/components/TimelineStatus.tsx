import { PRESSURE_MAX, STAMINA_MAX, attrValue, type RunState } from '@idollife/core';

/**
 * T-021：时间轴右侧状态栏（200px）——资金 + 体力/心情/压力/健康四条状态条 + 异常状态标签占位。
 * 异常状态系统后续立卡，本单只渲染占位「无所事事」+ 容器样式钩子。
 *
 * T-044：饱腹退役，换成「压力」。压力是反向指标：越高越糟，所以色调与其余三条相反。
 */
const VITALS: Array<{ key: string; label: string; max: number; inverted?: boolean }> = [
  { key: 'stamina', label: '体力', max: STAMINA_MAX },
  { key: 'mood', label: '心情', max: 100 },
  { key: 'stress', label: '压力', max: PRESSURE_MAX, inverted: true },
  { key: 'health', label: '健康', max: 100 },
];

/** 正向指标：越低越危险；反向指标（压力）：越高越危险 */
const toneOf = (pct: number, inverted = false) =>
  inverted
    ? pct >= 100
      ? 'danger'
      : pct >= 60
        ? 'warn'
        : ''
    : pct < 15
      ? 'danger'
      : pct < 30
        ? 'warn'
        : '';

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
              <span className={`tl-vital-bar ${toneOf(pct, v.inverted)}`}>
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
