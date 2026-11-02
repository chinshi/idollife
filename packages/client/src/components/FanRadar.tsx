import { FAN_KEYS, FAN_LABEL, attrValue, type RunState } from '@idollife/core';

/**
 * 六轴粉丝构成雷达图（T-014）——纯 SVG 手写，不引任何图表库。
 *
 * - 轴名与顺序来自 core 的 FAN_KEYS / FAN_LABEL（舞台粉/嘎起粉/音乐粉/现场粉/养成粉/实力粉）
 * - 半径按六类最大值归一化；六类全为 0 时不画图，显示空态「还没有粉丝构成」
 * - viewBox 0 0 200 200：3 圈网格 + 轴线 + 半透明填充多边形 + 轴标签（带数值）
 */
export function FanRadar({ run }: { run: RunState }) {
  const values = FAN_KEYS.map((key) => Math.max(0, attrValue(run, key)));
  const maxv = Math.max(0, ...values);

  if (maxv <= 0) {
    return <p className="attr-radar-empty muted small">还没有粉丝构成</p>;
  }

  const SIZE = 200;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = 66;
  const n = FAN_KEYS.length;
  const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointOf = (i: number, r: number) => ({
    x: cx + Math.cos(angleOf(i)) * r,
    y: cy + Math.sin(angleOf(i)) * r,
  });
  const ringPoints = (ratio: number) =>
    Array.from({ length: n }, (_, i) => {
      const p = pointOf(i, radius * ratio);
      return p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ');
  const valuePoints = values
    .map((value, i) => {
      const p = pointOf(i, radius * Math.min(1, value / maxv));
      return p.x.toFixed(1) + ',' + p.y.toFixed(1);
    })
    .join(' ');

  return (
    <svg
      className="attr-radar"
      viewBox={'0 0 ' + SIZE + ' ' + SIZE}
      role="img"
      aria-label="粉丝构成"
    >
      {[1 / 3, 2 / 3, 1].map((ratio) => (
        <polygon key={ratio} points={ringPoints(ratio)} className="attr-radar-grid" />
      ))}

      {FAN_KEYS.map((key, i) => {
        const p = pointOf(i, radius);
        return (
          <line
            key={'axis-' + key}
            x1={cx}
            y1={cy}
            x2={p.x.toFixed(1)}
            y2={p.y.toFixed(1)}
            className="attr-radar-axis"
          />
        );
      })}

      <polygon points={valuePoints} className="attr-radar-shape" />

      {FAN_KEYS.map((key, i) => {
        const p = pointOf(i, radius + 15);
        const cos = Math.cos(angleOf(i));
        // 左右两侧标签分别 end/start 对齐，上下用 middle，避免长中文名溢出
        const anchor = cos > 0.2 ? 'start' : cos < -0.2 ? 'end' : 'middle';
        return (
          <text
            key={'label-' + key}
            x={p.x.toFixed(1)}
            y={p.y.toFixed(1)}
            textAnchor={anchor}
            className="attr-radar-label"
          >
            {(FAN_LABEL[key] ?? key) + ' ' + String(values[i] ?? 0)}
          </text>
        );
      })}
    </svg>
  );
}
