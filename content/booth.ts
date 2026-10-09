// 足し方・書き方は docs/content-guide.md を参照
import type { BoothItem } from './types';

/** BOOTH の画像の住所の共通部分（BOOTH の商品ページの画像を右クリック →「画像のアドレスをコピー」） */
const IMAGE =
  'https://booth.pximg.net/c/300x300_a2_g5/bd4b15dc-73c5-4ee4-8812-1dc8fa093790/i';

/**
 * プロフィールの部屋の「BOOTH」に並べる、配布・販売しているもの。上から順に並ぶ。
 * 画像は BOOTH の商品の画像をそのまま表示する（BOOTH で画像を変えたら、ここの住所も変える）
 */
export const boothItems: BoothItem[] = [
  {
    title: 'こふりぃ / Coflet',
    url: 'https://bastelcolor.booth.pm/items/7525867',
    image: `${IMAGE}/7525867/2d28df0b-f2bf-45ba-9cef-06257ae50379_base_resized.jpg`,
    price: '無料',
  },
  {
    title: 'キュイプル / Quiple',
    url: 'https://bastelcolor.booth.pm/items/6746290',
    image: `${IMAGE}/6746290/1c6d563f-d2a1-4248-9e03-5ca915ab2eba_base_resized.jpg`,
    price: '無料',
  },
  {
    title: 'Easy Easy Ease [Blender]',
    url: 'https://bastelcolor.booth.pm/items/6739684',
    image: `${IMAGE}/6739684/e1882d41-b0ee-4fc0-9222-fdb805873644_base_resized.jpg`,
    price: '無料',
  },
  {
    title: 'ティミ / Timi',
    url: 'https://bastelcolor.booth.pm/items/6372032',
    image: `${IMAGE}/6372032/0173d7d5-c01c-4eb2-bb8d-9cb3940b9dc6_base_resized.jpg`,
    price: '無料',
  },
  {
    title: 'レモン',
    titleEn: 'Lemon',
    url: 'https://bastelcolor.booth.pm/items/5519300',
    image: `${IMAGE}/5519300/2d0bb343-65da-45a4-ada8-b6b2071a2509_base_resized.jpg`,
    price: '無料',
  },
  {
    title: '絵が描けなくてもキャラモデリング',
    titleEn: 'Character Modeling Even If You Can’t Draw',
    url: 'https://bastelcolor.booth.pm/items/5354527',
    image: `${IMAGE}/5354527/0561bfda-0ffc-42ab-b174-c187b72c11e6_base_resized.jpg`,
    price: '¥2,500',
  },
  {
    title: 'ぽっぷる',
    titleEn: 'Popple',
    url: 'https://bastelcolor.booth.pm/items/5232260',
    image: `${IMAGE}/5232260/1716614f-a4db-475e-a0f4-a34b43d080c1_base_resized.jpg`,
    price: '無料',
  },
  {
    title: 'ソラのガラケー',
    titleEn: 'Sora’s Flip Phone',
    url: 'https://bastelcolor.booth.pm/items/4554834',
    image: `${IMAGE}/4554834/c798dcd2-b971-435b-90d8-c8c7e36bffd2_base_resized.jpg`,
    price: '無料',
  },
];
