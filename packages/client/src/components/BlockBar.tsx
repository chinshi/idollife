import React from 'react';
import type { AdvanceBlock } from './advance-block';

/** T-035 主区推进受阻警示条 */
export function BlockBar({
  block,
  onPlan,
  onClose,
}: {
  block: AdvanceBlock;
  onPlan: () => void;
  onClose: () => void;
}) {
  return (
    <section className="mod mod-block-bar">
      <span className="block-bar-ico">!</span>
      <p className="block-bar-text">{block.text}</p>
      <button className="block-bar-go" onClick={onPlan}>
        去安排行程
      </button>
      <button className="block-bar-x" onClick={onClose} aria-label="关闭">
        ×
      </button>
    </section>
  );
}
