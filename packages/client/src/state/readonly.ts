/** T-036：只读态写入口统一拦截（返回 true 表示应中止） */
export function blockReadonlyWrite(readonly: boolean, notify: (text: string) => void): boolean {
  if (!readonly) return false;
  notify('本设备已退出登录，先点「在本设备继续」接管。');
  return true;
}
