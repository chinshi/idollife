import React from 'react';

/** T-036：被踢设备的只读横幅（真实组件，便于 SSR 验证） */
export function ReadonlyBanner({
  takingOver,
  onContinue,
}: {
  takingOver: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="crash-banner readonly-banner">
      <div className="crash-text">
        <strong>只读模式：</strong>
        <span>账号已在另一台设备继续，本设备已转为只读。</span>
      </div>
      <button className="icon-btn" onClick={onContinue} disabled={takingOver}>
        {takingOver ? '正在接管…' : '在本设备继续（另一台会被退出）'}
      </button>
    </div>
  );
}
