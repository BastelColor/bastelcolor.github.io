// 足し方・書き方は docs/content-guide.md を参照
import type { Work, WorkGenre } from './types';

/** 一覧の絞り込みボタンに並べる順 */
export const workGenres: { id: WorkGenre; label: string }[] = [
  { id: 'game', label: 'ゲーム' },
  { id: 'movie', label: '映像・画像' },
  { id: 'book', label: '書籍/同人誌' },
  { id: 'vr', label: 'VR' },
  { id: 'tool', label: 'ツール' },
];

// 項目の意味は content/types.ts の Work を参照
// 並び順: 代表作 → あとは新しい順
export const works: Work[] = [
  {
    id: 'marunomi-panic',
    genre: 'game',
    title: 'まるのみぱにっく！',
    category: 'GAME / UNITY',
    description: '学祭展示用の協力マルチTPS',
    thumbnail: '/works/marunomi-panic/thumb.webp',
    year: '2025〜',
    body: [
      '不思議生物研究所から逃げ出した「丸呑みドラゴン」を、最大4人で協力して落ち着かせるTPSです。キャラクターごとの固有スキルやアイテムで戦い、疲れ切ってスタンすると丸呑みにされてしまいます。',
      'キャラクターデザインとモデリング、ゲームプログラム、カットイン演出、インゲームUI、アニメーションリグ、ステージデザインまで、できる限り自分で制作しています。',
      'エネミーAIはUnityのBehavior、マルチプレイはNetcode for GameObjectsで実装しました。学祭のPCで動かすための最適化（CPU使用率57%減・GPU使用率50%減）や、サークル内で技術を共有するための資料づくりも行っています。',
      '今も開発を続けています。',
    ],
    images: [
      { src: '/works/marunomi-panic/01.webp', alt: '丸呑みされたときの画面' },
      { src: '/works/marunomi-panic/02.webp', alt: 'プレイ画面（固有スキル）' },
      { src: '/works/marunomi-panic/03.webp', alt: 'プレイ画面（アイテム）' },
      { src: '/works/marunomi-panic/04.webp', alt: '固有スキルのカットイン' },
      { src: '/works/marunomi-panic/05.webp', alt: 'ステージ' },
      { src: '/works/marunomi-panic/06.webp', alt: 'キャラクターデザイン' },
      { src: '/works/marunomi-panic/07.webp', alt: '丸呑みドラゴンの3Dモデル' },
      {
        src: '/works/marunomi-panic/08.webp',
        alt: 'キャラクター4人の3Dモデル',
      },
    ],
  },
  {
    id: 'nakayoshi-en',
    genre: 'movie',
    title: 'なかよし園 〜こころのかくれんぼ〜',
    category: 'MOVIE / TEAM',
    description: 'スマホゲームPV風の映像（チーム制作）',
    thumbnail: '/works/nakayoshi-en/thumb.webp',
    year: '2025',
    youtubeId: 'F-kqSeAOzy4',
    body: [
      'インターンで出会ったメンバーとチームで制作した、スマホのミニゲーム風のPV映像です。Cygames Creative Contest 2025 の最終選考作品です。',
      '映像・演出・編集を担当し、メンバー全員の制作物をひとつにまとめる役割を務めました。受け取ったPSDやMayaのデータをUnityで簡易的なゲームとして組み、After EffectsでUIアニメーションと効果音を加えて仕上げています。',
      '企画の段階で実現できる範囲を示したり、技術面の相談窓口を開いたり、編集作業を配信して進み具合を共有したりと、チームの進行も支えました。',
    ],
    links: [
      {
        label: 'YouTubeで見る',
        url: 'https://www.youtube.com/watch?v=F-kqSeAOzy4',
      },
    ],
  },
  {
    id: 'capcom-games-competition',
    genre: 'game',
    title: 'Dream.（CAPCOM GAMES COMPETITION）',
    category: 'GAME / PLANNING',
    description: 'ゲーム企画書の制作（チーム参加）',
    thumbnail: '/works/capcom-games-competition/thumb.webp',
    year: '2025',
    body: [
      'CAPCOM GAMES COMPETITIONにチームで参加した作品です。RE ENGINEで、2025年4月から9月まで制作しました。',
      '夢の世界に迷い込んだ少女つむぎと、案内人のバクの物語です。「悪い気持ち」に穢された夢の世界を治療するため、ステルスとタワーディフェンスを繰り返して「心」を守ります。',
      '最初にラフ案を出してチームで相談し、コンテストへの応募に向けてブラッシュアップして企画書を作りました。チーム全体ではデータベースと進捗の管理も行いました。',
      'コンテストの規約により、制作の詳細はほとんど公開できません。',
    ],
    images: [
      {
        src: '/works/capcom-games-competition/01.webp',
        alt: '最初に出した世界観のラフ案',
      },
      {
        src: '/works/capcom-games-competition/02.webp',
        alt: '企画書「Dream.」ステルスとタワーディフェンス',
      },
      {
        src: '/works/capcom-games-competition/03.webp',
        alt: '企画書「アクション」注射器を使った3つのアクション',
      },
    ],
  },
  {
    id: 'virtual-camera',
    genre: 'tool',
    title: 'Virtual Camera for DCCTools',
    category: 'TOOL / UNITY・BLENDER',
    description: 'スマホで操作するバーチャルカメラと、DCCツール用プラグイン',
    thumbnail: '/works/virtual-camera/thumb.webp',
    year: '2026',
    body: [
      '動画の制作中に思うようなカメラワークが出せなかったことから、複数のDCCツールで使えるバーチャルカメラのアプリと、各ツールに組み込むプラグインを開発しました。',
      'アプリはUnity製のAndroidアプリで、動き回れるARモードと、その場で向きを変えるジャイロモードがあります。カメラの位置と回転はOpen Sound Control、映像はNDIでやりとりするので、プラグインを用意すれば他のDCCツールにも広げられます。まずはBlender版のプラグインを作りました。',
      '仕事での開発を意識して、ライセンスにも気を配った構成にしています。',
    ],
    images: [
      {
        src: '/works/virtual-camera/01.webp',
        alt: 'スマホで動かしているバーチャルカメラアプリ',
      },
      { src: '/works/virtual-camera/02.webp', alt: 'アプリの画面（ARモード）' },
      {
        src: '/works/virtual-camera/03.webp',
        alt: 'Blender側でカメラの映像を受け取っている画面',
      },
    ],
  },
  {
    id: 'easy-easy-ease',
    genre: 'tool',
    title: 'Easy Easy Ease',
    category: 'TOOL / BLENDER ADD-ON',
    description: 'あとから編集できるイージングを作るBlenderアドオン',
    thumbnail: '/works/easy-easy-ease/thumb.webp',
    year: '2025',
    body: [
      'Blenderには、あとから編集できないアニメーションのプリセットしかないという課題から作ったアドオンです。',
      'イージングの種類と強さを選んでボタンを押すと、ハンドルを残した編集できるカーブができます。ハンドルのタイプをFREEにしているので、あとから自由に調整できます。',
      'サークル内でヒアリングをしてから作り、コードのコメントは海外の人にも読めるよう英語で書いています。BOOTHで無料配布しています。',
    ],
    images: [
      {
        src: '/works/easy-easy-ease/01.webp',
        alt: 'Blender標準のイージングのプリセット（あとから編集できない）',
      },
      { src: '/works/easy-easy-ease/02.webp', alt: 'アドオンで作ったカーブ' },
      { src: '/works/easy-easy-ease/03.webp', alt: '種類ごとのカーブ' },
      { src: '/works/easy-easy-ease/04.webp', alt: 'ハンドルを残したカーブ' },
      { src: '/works/easy-easy-ease/05.webp', alt: 'アドオンのパネル' },
    ],
    links: [
      {
        label: 'BOOTHで見る（無料）',
        url: 'https://bastelcolor.booth.pm/items/6739684',
      },
    ],
  },
  {
    id: 'toon-shader',
    genre: 'tool',
    title: 'ToonShader for Blender',
    category: 'TOOL / BLENDER SHADER',
    description: 'シーンになじむ自作のトゥーンシェーダー',
    thumbnail: '/works/toon-shader/thumb.webp',
    year: '2025',
    body: [
      '一般的な放射シェーダーでは影が出ず、キャラクターが光って浮いて見えてしまいます。そこで、影をつけてシーンの色に合わせられるトゥーンシェーダーをノードグループで作りました。',
      '明るさ、ライトの色、影、リムライト、AOを調整できます。',
    ],
    images: [
      {
        src: '/works/toon-shader/01.webp',
        alt: 'Before: 一般的な放射シェーダー',
      },
      {
        src: '/works/toon-shader/02.webp',
        alt: 'After: 自作のトゥーンシェーダー',
      },
      { src: '/works/toon-shader/03.webp', alt: 'シェーダーのノードグループ' },
    ],
  },
  {
    id: 'underground-passage',
    genre: 'movie',
    title: '某有名な地下通路',
    category: '3DCG / BACKGROUND',
    description: 'トゥーンシェーダーの検証用に作った背景',
    thumbnail: '/works/underground-passage/thumb.webp',
    year: '2025',
    body: [
      'ToonShader for Blenderの検証に、反射のある環境が欲しくて作った背景です。',
      '時間が限られていたのでテクスチャはプロシージャルで作りました。リファレンスを見ながら外部のテクスチャもシェーダーで加工し、ポストプロセスで仕上げています。',
    ],
    images: [
      { src: '/works/underground-passage/01.webp', alt: 'レンダリング' },
      { src: '/works/underground-passage/02.webp', alt: 'ワイヤーフレーム' },
      { src: '/works/underground-passage/03.webp', alt: 'シェーダーのノード' },
      {
        src: '/works/underground-passage/04.webp',
        alt: '点字ブロックのノード',
      },
      { src: '/works/underground-passage/05.webp', alt: '壁のタイルの汚れ' },
    ],
  },
  {
    id: 'avatar-world',
    genre: 'vr',
    title: 'アバター展示ワールド',
    category: 'VRCHAT / WORLD',
    description: 'アバターを展示する空中庭園のワールド',
    thumbnail: '/works/avatar-world/thumb.webp',
    year: '2025',
    body: [
      '「その場で休める空中庭園」をテーマにした、VRChatのアバター展示ワールドです。アバターを着るだけで終わらないワールドを目指しました。',
      '動画プレイヤー、ワンクリックで着替えられるペデスタル、見た目を確認できるミラーを置いています。',
    ],
    images: [
      { src: '/works/avatar-world/01.webp', alt: '空に浮かぶワールドの全体' },
      { src: '/works/avatar-world/02.webp', alt: '動画プレイヤー' },
      {
        src: '/works/avatar-world/03.webp',
        alt: 'ワンクリックで着替えられるペデスタル',
      },
      { src: '/works/avatar-world/04.webp', alt: '見た目を確認できるミラー' },
    ],
  },
  {
    id: 'characters',
    genre: 'vr',
    title: '歴代キャラクター 2023–2025',
    category: '3DCG / CHARACTER',
    description: 'これまでに作ってきた3Dキャラクターたち',
    thumbnail: '/works/characters/thumb.webp',
    year: '2023〜2025',
    body: [
      '「デザインの学習」と「3D技術の向上」を目標に、3Dキャラクターを作り続けています。中心はVRChatで使えるアバターで、無料配布もたくさん行ってきました。',
      'Quiple・こふりぃ・Timiは、アバターの部屋で3Dモデルを見られます。',
    ],
    cover: '/works/characters/all.webp',
  },
  {
    id: 'kcs-cg-movie',
    genre: 'movie',
    title: 'KCS CG班映像制作',
    category: 'CG MOVIE',
    description: 'キャラクター・モーション・進行管理',
    thumbnail: '/works/kcs-cg-movie/thumb.webp',
    year: '2023',
    body: ['KCS 3DCG班の2023年の作品「Door Open」（約6分）です。'],
    youtubeId: 'WTPK9qEO5x0',
    links: [
      {
        label: 'YouTubeで見る',
        url: 'https://www.youtube.com/watch?v=WTPK9qEO5x0',
      },
    ],
  },
  {
    id: 'chara-modeling-book',
    genre: 'book',
    title: '絵が描けなくてもキャラモデリング',
    category: 'WRITING',
    description: '技術同人誌・技書博アワード優秀賞',
    thumbnail: '/works/chara-modeling-book/thumb.webp',
    year: '2023',
    body: [
      '技術書典15と第九回技術書同人誌博覧会で頒布した、単独執筆の技術同人誌です（243ページ）。技書博アワードで優秀賞をいただきました。',
      '「絵が描けないとキャラモデリングはできない」という風潮に負けて一度あきらめた、かつての自分に向けて書きました。人体の知識がなくても迷わないよう、ていねいに書き込んでいます。',
      'Blenderの基本操作から、キャラクターのモデリング、VRChatに必要なものの用意、Unityでの設定、アップロードまでを一冊にまとめています。',
    ],
    images: [
      {
        src: '/works/chara-modeling-book/01.webp',
        alt: '本文の紹介「本質情報を学んでいく！」',
      },
      {
        src: '/works/chara-modeling-book/02.webp',
        alt: '本文の紹介「難しい話も少し触れつつ…」',
      },
      {
        src: '/works/chara-modeling-book/03.webp',
        alt: '目次（第1章・第2章）',
      },
      {
        src: '/works/chara-modeling-book/04.webp',
        alt: '目次（第3章〜第5章）',
      },
      {
        src: '/works/chara-modeling-book/05.webp',
        alt: '目次（第6章・参考文献）',
      },
    ],
    links: [{ label: 'BOOTHで見る', url: 'https://booth.pm/ja/items/5354527' }],
  },
  {
    id: 'techbookfest',
    genre: 'book',
    title: '技術書典 サークル出展',
    category: 'WRITING / CIRCLE',
    description: 'サークルの技術同人誌で、執筆・組版・表紙を担当',
    thumbnail: '/works/techbookfest/thumb.webp',
    year: '2023〜2025',
    body: [
      '技術書典14（2023年春）から毎回、サークルとして出展しています。担当したものは次のとおりです。',
      '技術書典14：本文執筆「キャラモデリングのバリエーション宗派」（初めての執筆）',
      '技術書典15：本文執筆・組版「絵が描けなくてもキャラモデリング」（単独執筆）',
      '技術書典16：本文執筆・組版「雰囲気だけの深層学習入門」',
      '技術書典17：本文執筆・表紙イラスト「VoiceVoxを使ったローカル環境音声対話AI」',
      '技術書典18：本文執筆「物語に忠実なネーミング手法」',
      '技術書典19：表紙イラスト',
    ],
    links: [
      {
        label: '技術書典のサークルページ',
        url: 'https://techbookfest.org/organization/5738600293466112',
      },
    ],
  },
  {
    id: 'starry-sky',
    genre: 'tool',
    title: 'Starry Sky',
    category: 'SHADER / BLENDER',
    description: 'プロシージャルな星空シェーダーと、その解説動画',
    thumbnail: '/works/starry-sky/thumb.webp',
    year: '2021',
    youtubeId: 'L4cKjMnT1e8',
    body: [
      '既存の星空シェーダー（Joey Carlinoさんのもの）を参考に、星雲や色、明るい星を加えたプロシージャルな星空シェーダーです。参考元と同じく、パラメーターで見た目を調整できます。',
      '作り方を解説する動画も作って公開しました。',
    ],
    images: [{ src: '/works/starry-sky/01.webp', alt: '星空のアップ' }],
    links: [
      {
        label: '解説動画をYouTubeで見る',
        url: 'https://www.youtube.com/watch?v=L4cKjMnT1e8',
      },
    ],
  },
  {
    id: 'simple-apartment',
    genre: 'vr',
    title: 'SimpleApartment',
    category: '3DCG / WORLD',
    description: 'VRChat向けワールド制作',
    thumbnail: '/works/simple-apartment/thumb.webp',
    body: ['VRChat向けに制作したワールドです。今はα版として公開しています。'],
    links: [
      {
        label: 'VRChatで見る',
        url: 'https://vrchat.com/home/world/wrld_bbe664a6-5540-45d8-9379-449b560577ac',
      },
    ],
  },
];
