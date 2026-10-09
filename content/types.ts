export type PageId = 'profile' | 'works' | 'avatar' | 'log';

/** ページごとのテーマ色。CSS の `.pink` などのクラス名と対応する（app/styles/base.css） */
export type Tone = 'pink' | 'mint' | 'blue' | 'yellow';

export type SitePage = {
  id: PageId;
  tone: Tone;
  /** トップの雲と、部屋の見出しに表示する名前 */
  menuLabel: string;
  /** 部屋の見出しの下の一言 */
  note: string;
  /** 雲のうしろから顔を出すキャラクター（public/characters/、VRM から描画した画像） */
  mascot?: Mascot;
  /** 英語で表示するときの文言 */
  en: { menuLabel: string; note: string };
};

export type Mascot = {
  /** ふだんの顔 */
  normal: string;
  /** ホバーしたとき・部屋でのぞくときの笑顔（VRM の happy 表情） */
  happy: string;
  /**
   * 画像の横幅（既定 1）。画像は顔の大きさがそろう同じ倍率で撮っていて、
   * 基準の正方形からはみ出す部分（しっぽなど）は右と下に広げて撮っている。
   * その広げた分の倍率。
   */
  width?: number;
};

export type ExternalLink = {
  label: string;
  url: string;
};

export type Profile = {
  /** 1要素 = 1行 */
  leadLines: string[];
  body: string;
  /** 「つかっているもの」。慣れている順にまとまりで並べる */
  skills: SkillGroup[];
  /** 「資格」。1要素が1行。無ければ空の [ ] にすると、行ごと出なくなる */
  certifications: string[];
  links: ExternalLink[];
  /** 英語で表示するときの文章（links はそのまま使う） */
  en: Omit<Profile, 'links' | 'en'>;
};

export type SkillGroup = {
  /** まとまりの見出し（例: 'メイン'） */
  level: string;
  items: string[];
};

/**
 * 作品。画像は public/works/<id>/ に置く。
 * 省略できる項目は、書いたものだけが詳細に表示される。
 */
export type Work = {
  /** 英数字とハイフン。画像のフォルダ名にも使う */
  id: string;
  title: string;
  /** 一覧の絞り込みに使うジャンル（content/works.ts の workGenres） */
  genre: WorkGenre;
  /** ジャンルより細かい分類（一覧と詳細に小さく表示） */
  category: string;
  /** 一覧と詳細の冒頭に出す一言 */
  description: string;
  /** 一覧のサムネイル（横長 16:10 で切り抜いて表示）。無いときは分類名を色の上に表示する */
  thumbnail?: string;
  /** 制作年など（例: '2024'） */
  year?: string;
  /** 詳細の本文。1要素 = 1段落 */
  body?: string[];
  /**
   * 詳細のいちばん上に大きく出す画像。サムネイルと別の絵を見せたいときに使う
   * （縦横比はそのまま表示。省略時はサムネイル）
   */
  cover?: string;
  /** 詳細のいちばん上に埋め込む YouTube 動画の ID（URL の v= のあと）。cover より優先 */
  youtubeId?: string;
  /** 詳細に並べる画像 */
  images?: WorkImage[];
  /** 本文の下にボタンで出す外部リンク（BOOTH、配布ページ、記事など）。無ければボタンは出ない */
  links?: ExternalLink[];
  /**
   * 英語で表示するときの文章。書いたものだけが英語になる（無いものは日本語のまま）。
   * links は、ボタンの文字だけを上から順に書く
   */
  en?: {
    title?: string;
    description?: string;
    body?: string[];
    links?: string[];
  };
};

export type WorkGenre = 'game' | 'movie' | 'book' | 'vr' | 'tool';

export type WorkImage = {
  src: string;
  /** 画像の説明（読み上げ用） */
  alt: string;
};

export type Avatar = {
  id: string;
  /** 名前（BOOTH と同じ）。選択ボタンに大きく出る */
  name: string;
  /** 英語の名前。名前の下に小さく出る */
  nameEn: string;
  /** ひとこと紹介。選んでいる子の紹介として、選ぶボタンの下に出る */
  description: string;
  /** 小さな目印（例: '無料配布中'、'制作中'）。名前の横と紹介の上に出る。省略できる */
  badge?: string;
  /** SNS で共有したときのカードの画像（1200x630）。省略するとサイト共通の画像 */
  ogImage?: string;
  /** BOOTH の商品ページ。「BOOTHで見る」がここへ飛ぶ（省略するとショップのトップ） */
  booth?: string;
  /** public/ 以下の VRM ファイルのパス */
  modelUrl: string;
  /** 選択ボタンの顔アイコン（VRM から描画した画像）。選んでいるあいだは笑顔 */
  icon: {
    normal: string;
    happy: string;
  };
  /** 3D ビューアの照明の明るさ（倍率、既定 1）。白っぽいモデルが暗く見えるときに上げる */
  brightness?: number;
  /**
   * lilToon の見た目で表示する。Unity の Mochiya Avatar Tools で書き出した VRM のときだけ true
   * （ふつうの VRM は MToon で表示する）
   */
  liltoon?: boolean;
  /** 英語で表示するときの、ひとこと紹介と目印 */
  en?: { description?: string; badge?: string };
};

/** プロフィールの部屋の「BOOTH」に並べる1つ（content/booth.ts） */
export type BoothItem = {
  /** 商品名 */
  title: string;
  /** BOOTH の商品ページ */
  url: string;
  /** 商品の画像（BOOTH の画像の住所） */
  image: string;
  /** 値段の表示（'無料'、'¥2,500' など。'無料' は英語では Free と出る） */
  price: string;
  /** 英語で表示するときの商品名（省略すると title のまま） */
  titleEn?: string;
};
