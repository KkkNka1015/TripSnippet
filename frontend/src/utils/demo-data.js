/**
 * 演示数据包：一键创建「示例 · 京都五日」
 * 图片素材为真实旅行照片（随构建产物打包，经 Vite 指纹化后由 Service Worker 预缓存）。
 */
import { makeThumb } from './image';
import kiyomizuImg from '../assets/demo/kiyomizu-stage.jpg';
import kyotoNightImg from '../assets/demo/kyoto-night.jpg';

/** 图片 URL → blob（同源静态资源，直接 fetch） */
async function loadBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('示例图片加载失败');
  return res.blob();
}

/**
 * 构建示例素材（顺序即导出序号）
 * @returns {Promise<Array>} addMaterials 入参数组
 */
export async function buildDemoItems() {
  const [kiyomizuBlob, nightBlob] = await Promise.all([
    loadBlob(kiyomizuImg),
    loadBlob(kyotoNightImg),
  ]);
  const [kiyomizuThumb, nightThumb] = await Promise.all([
    makeThumb(kiyomizuBlob),
    makeThumb(nightBlob),
  ]);
  const kiyomizu = { blob: kiyomizuBlob, thumb: kiyomizuThumb };
  const night = { blob: nightBlob, thumb: nightThumb };
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
      title: '清水寺 · 舞台与满山绿意',
      blob: kiyomizu.blob,
      thumb: kiyomizu.thumb,
      mime: 'image/jpeg',
      size: kiyomizu.blob.size,
      tags: ['景点', '打卡'],
      remark: '阴天也好看，舞台悬在枫林之上，远处能望到市区',
      travelDate: 'Day 2 上午',
      sourceType: 'manual',
    },
    {
      type: 'image',
      title: '京都夜色 · 鸟居与灯笼',
      blob: night.blob,
      thumb: night.thumb,
      mime: 'image/jpeg',
      size: night.blob.size,
      tags: ['景点', '夜游'],
      remark: '晚上八点的神社，石鸟居被暖灯点亮，几乎没有人',
      travelDate: 'Day 2 夜晚',
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
