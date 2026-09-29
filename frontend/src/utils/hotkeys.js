/**
 * 快捷键工具
 * 全局快捷键不应劫持输入场景：焦点在输入框 / 文本域 / 可编辑区时放行默认行为
 */

/** 事件目标是否为输入控件（快捷键忽略） */
export function isTypingTarget(e) {
  const t = e?.target;
  if (!t || typeof t !== 'object') return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true;
}
