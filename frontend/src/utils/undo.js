/**
 * 删除撤销提示：窗口期内展示带「撤销」按钮的 toast
 * 快照由调用方在删除前生成（store.snapshotMaterials / store.snapshotProject），
 * 恢复动作通过 restore 回调传入，与 toast 生命周期解耦。
 */
import { h } from 'vue';

/** 撤销窗口（毫秒）：toast 停留时长 = 可撤销时长，保持一致 */
export const UNDO_WINDOW_MS = 10000;

/**
 * 弹出「已删除 + 撤销」toast
 * @param {Object} options
 * @param {Object} options.message NaiveUI useMessage 实例
 * @param {string} options.text 提示文案（如「已删除」）
 * @param {Function} options.restore 撤销动作（恢复数据），抛错时提示失败
 * @param {Function} [options.onUndone] 撤销成功后的回调（如刷新封面）
 */
export function offerUndo({ message, text, restore, onUndone }) {
  const msg = message.success(
    () =>
      h('div', { class: 'flex items-center gap-3' }, [
        h('span', null, text),
        h(
          'button',
          {
            class: 'ts-btn-outline ts-btn-sm',
            onClick: async () => {
              try {
                await restore();
                msg.destroy();
                onUndone?.();
              } catch (err) {
                message.error(err.message || '恢复失败');
              }
            },
          },
          '撤销'
        ),
      ]),
    { duration: UNDO_WINDOW_MS }
  );
  return msg;
}
