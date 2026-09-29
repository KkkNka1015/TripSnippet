/**
 * 演示数据包：一键创建「示例 · 京都五日」
 * 图片素材全部由 canvas 程序化绘制（复古旅行手账风），不引用任何外部图片资源。
 */
import { makeThumb } from './image';

const POSTCARD_W = 640;
const POSTCARD_H = 480;

/** canvas 转 JPEG blob */
function canvasToBlob(canvas, quality = 0.88) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), 'image/jpeg', quality);
  });
}

/** 新建画布并填充纸质底色 */
function newCanvas(bg) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTCARD_W;
  canvas.height = POSTCARD_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, POSTCARD_W, POSTCARD_H);
  return { canvas, ctx };
}

/** 渐变填充辅助 */
function fillGradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/** 复古相片日期戳（右下角，机械相机风） */
function stampDate(ctx, text) {
  ctx.save();
  ctx.font = '18px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255, 240, 214, 0.92)';
  ctx.fillText(text, POSTCARD_W - 24, POSTCARD_H - 22);
  ctx.restore();
}

/** 相片白边（拍立得风）+ 轻微暗角 */
function decorateFrame(ctx) {
  ctx.save();
  // 暗角：四周压一圈半透明暖棕
  const vg = ctx.createRadialGradient(
    POSTCARD_W / 2, POSTCARD_H / 2, POSTCARD_H * 0.42,
    POSTCARD_W / 2, POSTCARD_H / 2, POSTCARD_W * 0.72
  );
  vg.addColorStop(0, 'rgba(64, 46, 30, 0)');
  vg.addColorStop(1, 'rgba(64, 46, 30, 0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, POSTCARD_W, POSTCARD_H);
  // 白边框
  ctx.strokeStyle = 'rgba(252, 248, 240, 0.95)';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, POSTCARD_W - 14, POSTCARD_H - 14);
  ctx.restore();
}

/** 场景一：清水寺 · 晨雾中的五重塔（暖橘晨光） */
async function paintKiyomizu() {
  const { canvas, ctx } = newCanvas('#e8b98a');
  // 晨光天空
  fillGradient(ctx, 0, 0, 0, POSTCARD_H, [
    [0, '#f2d3a0'], [0.55, '#e8b98a'], [1, '#d98e73'],
  ]);
  // 朝阳
  ctx.fillStyle = '#f7e8c8';
  ctx.beginPath();
  ctx.arc(POSTCARD_W * 0.78, POSTCARD_H * 0.26, 34, 0, Math.PI * 2);
  ctx.fill();
  // 远山（层叠剪影）
  const hills = [
    { y: 300, c: 'rgba(163, 132, 108, 0.55)', amp: 60 },
    { y: 330, c: 'rgba(122, 96, 78, 0.7)', amp: 46 },
    { y: 360, c: 'rgba(92, 70, 56, 0.85)', amp: 34 },
  ];
  for (const h of hills) {
    ctx.fillStyle = h.c;
    ctx.beginPath();
    ctx.moveTo(0, POSTCARD_H);
    ctx.lineTo(0, h.y);
    for (let x = 0; x <= POSTCARD_W; x += 16) {
      ctx.lineTo(x, h.y - Math.sin(x * 0.012 + h.amp) * h.amp * 0.35 - Math.cos(x * 0.03) * 12);
    }
    ctx.lineTo(POSTCARD_W, POSTCARD_H);
    ctx.closePath();
    ctx.fill();
  }
  // 五重塔剪影
  ctx.fillStyle = '#4a382c';
  const towerX = POSTCARD_W * 0.3;
  const tiers = [86, 150, 212, 272];
  const widths = [118, 104, 90, 76];
  tiers.forEach((y, i) => {
    const w = widths[i];
    // 檐角上翘的屋顶
    ctx.beginPath();
    ctx.moveTo(towerX - w / 2, y);
    ctx.quadraticCurveTo(towerX - w / 2 - 12, y - 14, towerX - w / 2 - 20, y - 6);
    ctx.lineTo(towerX + w / 2 + 20, y - 6);
    ctx.quadraticCurveTo(towerX + w / 2 + 12, y - 14, towerX + w / 2, y);
    ctx.lineTo(towerX + w / 2 - 8, y + 8);
    ctx.lineTo(towerX - w / 2 + 8, y + 8);
    ctx.closePath();
    ctx.fill();
    // 塔身
    ctx.fillRect(towerX - (w - 34) / 2, y + 8, w - 34, 58);
  });
  // 塔刹
  ctx.fillRect(towerX - 3, 40, 6, 50);
  // 飞鸟
  ctx.strokeStyle = '#4a382c';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [bx, by, s] of [[470, 120, 1], [530, 100, 0.8], [590, 140, 0.6]]) {
    ctx.beginPath();
    ctx.moveTo(bx - 16 * s, by);
    ctx.quadraticCurveTo(bx - 8 * s, by - 9 * s, bx, by);
    ctx.quadraticCurveTo(bx + 8 * s, by - 9 * s, bx + 16 * s, by);
    ctx.stroke();
  }
  stampDate(ctx, "KYOTO '26 09.21");
  decorateFrame(ctx);
  const blob = await canvasToBlob(canvas);
  return { blob, thumb: await makeThumb(blob) };
}

/** 场景二：锦市场 · 灯笼与团子（暖黄市集） */
async function paintMarket() {
  const { canvas, ctx } = newCanvas('#f0dfb2');
  // 暖黄市集顶棚
  fillGradient(ctx, 0, 0, 0, 190, [
    [0, '#d9a05b'], [1, '#c98548'],
  ]);
  ctx.fillStyle = '#b06f38';
  for (let x = 0; x < POSTCARD_W; x += 64) ctx.fillRect(x, 0, 4, 190);
  // 灯笼串
  for (const [lx, ly, r] of [
    [120, 150, 26], [230, 168, 32], [350, 148, 28], [470, 172, 34], [580, 150, 26],
  ]) {
    // 灯笼体
    ctx.fillStyle = '#e85d3d';
    ctx.beginPath();
    ctx.ellipse(lx, ly, r * 0.78, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // 上下压盖
    ctx.fillStyle = '#5c4638';
    ctx.fillRect(lx - r * 0.5, ly - r - 5, r, 6);
    ctx.fillRect(lx - r * 0.5, ly + r - 1, r, 6);
    // 高光
    ctx.fillStyle = 'rgba(255, 235, 200, 0.35)';
    ctx.beginPath();
    ctx.ellipse(lx - r * 0.28, ly - r * 0.3, r * 0.22, r * 0.4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 摊位台面
  ctx.fillStyle = '#8a6f4e';
  ctx.fillRect(0, 340, POSTCARD_W, 140);
  ctx.fillStyle = '#a3846c';
  ctx.fillRect(0, 340, POSTCARD_W, 14);
  // 团子串 ×3
  for (const [sx, sy] of [[170, 300], [320, 310], [470, 295]]) {
    ctx.strokeStyle = '#6e5643';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 92);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.fillStyle = '#9ec49a';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(sx, sy + k * 30, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 抹茶碗
  ctx.fillStyle = '#5d7d5a';
  ctx.beginPath();
  ctx.arc(560, 330, 24, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#77a06f';
  ctx.beginPath();
  ctx.ellipse(560, 330, 24, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // 前景人影剪影（背影，逛市集）
  ctx.fillStyle = 'rgba(74, 56, 44, 0.75)';
  for (const [px, pw] of [[90, 34], [130, 30]]) {
    ctx.beginPath();
    ctx.arc(px, 388, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - pw / 2, 460);
    ctx.lineTo(px - pw / 3, 398);
    ctx.quadraticCurveTo(px, 386, px + pw / 3, 398);
    ctx.lineTo(px + pw / 2, 460);
    ctx.closePath();
    ctx.fill();
  }
  stampDate(ctx, "NISHIKI '26 09.22");
  decorateFrame(ctx);
  const blob = await canvasToBlob(canvas);
  return { blob, thumb: await makeThumb(blob) };
}

/**
 * 构建示例素材（顺序即导出序号）
 * @returns {Promise<Array>} addMaterials 入参数组
 */
export async function buildDemoItems() {
  const [kiyomizu, market] = await Promise.all([paintKiyomizu(), paintMarket()]);
  return [
    {
      type: 'text',
      title: 'Day 1 · 抵达京都',
      content: [
        '- 关西机场 → 京都站：HARUKA 特急约 75 分钟',
        '- 入住四条河原町附近旅馆，先寄存行李',
        '- 傍晚沿鸭川散步，踩着跳石看夕阳',
        '- 晚餐：先斗町的亲子丼，热乎治愈',
      ].join('\n'),
      tags: ['行程'],
      remark: '傍晚的鸭川比想象中安静',
      travelDate: 'Day 1',
      sourceType: 'manual',
    },
    {
      type: 'text',
      title: 'Day 2 · 清水寺 → 二年坂 → 祇园',
      content: [
        '- 早上 7 点前到清水寺，人少雾气正好',
        '- 音羽瀑布三道水：学业 / 恋爱 / 长寿，只喝一道',
        '- 二年坂买抹茶团子；三年坂不回头（传说）',
        '- 傍晚祇园花见小路，偶遇艺伎概率更高',
      ].join('\n'),
      tags: ['行程', '景点'],
      remark: '清水寺开门时间 6:00，晨光值得早起',
      travelDate: 'Day 2',
      sourceType: 'manual',
    },
    {
      type: 'image',
      title: '清水寺 · 晨雾中的五重塔',
      blob: kiyomizu.blob,
      thumb: kiyomizu.thumb,
      mime: 'image/jpeg',
      size: kiyomizu.blob.size,
      tags: ['景点', '打卡'],
      remark: '晨雾还没散，塔尖若隐若现',
      travelDate: 'Day 2 上午',
      sourceType: 'manual',
    },
    {
      type: 'image',
      title: '锦市场 · 灯笼与团子',
      blob: market.blob,
      thumb: market.thumb,
      mime: 'image/jpeg',
      size: market.blob.size,
      tags: ['美食', '打卡'],
      remark: '刚烤好的团子还冒着热气',
      travelDate: 'Day 3',
      sourceType: 'manual',
    },
    {
      type: 'text',
      title: '京都美食备忘',
      content: [
        '- 锦市场：豆乳甜甜圈、玉子烧串',
        '- 抹茶控：中村藤吉本店生茶果冻',
        '- 拉面：一兰京都河原町店（排队 20 分钟起）',
        '- 便利店限定：抹茶啤酒、关东煮萝卜',
      ].join('\n'),
      tags: ['美食'],
      remark: '甜口偏多，记得配茶',
      travelDate: 'Day 3',
      sourceType: 'manual',
    },
    {
      type: 'text',
      title: '伴手礼清单',
      content: [
        '□ 生八桥（阿阇梨饼，保质期短最后再买）',
        '□ 抹茶粉 · 宇治辻利',
        '□ 吸油面纸（艺伎牌）',
        '□ 手工筷子（清水寺店的特色）',
      ].join('\n'),
      tags: ['购物'],
      remark: '预算约 15000 日元',
      travelDate: 'Day 5',
      sourceType: 'manual',
    },
  ];
}
