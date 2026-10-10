// 足し方・書き方は docs/content-guide.md を参照
import type { Work, WorkGenre } from './types';

/** 一覧の絞り込みボタンに並べる順 */
export const workGenres: { id: WorkGenre; label: string; labelEn: string }[] = [
  { id: 'game', label: 'ゲーム', labelEn: 'Games' },
  { id: 'movie', label: '映像・画像', labelEn: 'Video & Images' },
  { id: 'book', label: '書籍/同人誌', labelEn: 'Books & Zines' },
  { id: 'vr', label: 'VR', labelEn: 'VR' },
  { id: 'tool', label: 'ツール', labelEn: 'Tools' },
];

// 項目の意味は content/types.ts の Work を参照
// 並び順: 代表作 → あとは新しい順
export const works: Work[] = [
  {
    id: 'marunomi-panic',
    en: {
      description: 'A co-op multiplayer TPS for a school festival exhibit',
      body: [
        'A TPS where up to four players team up to calm down the “Swallowing Dragon” that escaped from a lab studying mysterious creatures. Each character fights with unique skills and items—and if you get exhausted and stunned, you get swallowed whole.',
        'I made as much of it as I could myself: character design and modeling, gameplay programming, cut-in effects, in-game UI, animation rigs, and stage design.',
        'The enemy AI uses Unity Behavior, and multiplayer uses Netcode for GameObjects. I also optimized it to run on the festival PCs (57% less CPU and 50% less GPU usage) and wrote documents to share the techniques within our club.',
        'Still in development.',
      ],
    },
    genre: 'game',
    title: 'まるのみぱにっく！',
    category: 'GAME / UNITY',
    tools: ['Unity'],
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
    en: {
      description: 'A mobile-game-style PV (team project)',
      body: [
        'A PV styled like a mobile mini-game, made with a team I met at an internship. It was a finalist in the Cygames Creative Contest 2025.',
        'I handled the video, direction, and editing, and pulled everyone’s work together into one piece. I assembled the PSD and Maya data I received into a simple game in Unity, then finished it with UI animation and sound effects in After Effects.',
        'I also supported the team’s progress: showing what was feasible at the planning stage, being the go-to person for technical questions, and streaming my editing work to share progress.',
      ],
      links: ['Watch on YouTube'],
    },
    genre: 'movie',
    title: 'なかよし園 〜こころのかくれんぼ〜',
    category: 'MOVIE / TEAM',
    tools: ['Unity', 'After Effects'],
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
    en: {
      description: 'A game proposal (team entry)',
      body: [
        'Our team’s entry to the CAPCOM GAMES COMPETITION, made with RE ENGINE from April to September 2025.',
        'The story of Tsumugi, a girl lost in a world of dreams, and Baku, her guide. To heal the dream world tainted by “bad feelings,” she protects the “heart” through alternating stealth and tower-defense phases.',
        'I first pitched a rough idea, discussed it with the team, and refined it into a proposal for the contest. I also managed the team’s database and progress.',
        'Because of the contest rules, most of the production details can’t be shared.',
      ],
    },
    genre: 'game',
    title: 'Dream.（CAPCOM GAMES COMPETITION）',
    category: 'GAME / PLANNING',
    tools: ['RE ENGINE'],
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
    en: {
      description:
        'A smartphone-controlled virtual camera, with plugins for DCC tools',
      body: [
        'I couldn’t get the camera work I wanted while making videos, so I developed a virtual camera app that works with multiple DCC tools, along with a plugin for each tool.',
        'The app is an Android app made in Unity, with an AR mode for walking around and a gyro mode for turning in place. Camera position and rotation are sent over Open Sound Control and video over NDI, so it can support other DCC tools just by adding a plugin. The first plugin is for Blender.',
        'With professional development in mind, I also paid attention to licensing when structuring it.',
      ],
    },
    genre: 'tool',
    title: 'Virtual Camera for DCCTools',
    category: 'TOOL / UNITY・BLENDER',
    tools: ['Unity', 'Blender'],
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
    en: {
      description: 'A Blender add-on that creates easing you can edit later',
      body: [
        'An add-on born from the problem that Blender only has animation presets you can’t edit afterwards.',
        'Choose an easing type and strength, press the button, and you get an editable curve with its handles kept. The handles are set to FREE, so you can adjust them freely later.',
        'I interviewed members of my club before building it, and wrote the code comments in English so people overseas can read them too. It’s available for free on BOOTH.',
      ],
      links: ['View on BOOTH (free)'],
    },
    genre: 'tool',
    title: 'Easy Easy Ease',
    category: 'TOOL / BLENDER ADD-ON',
    tools: ['Blender', 'Python'],
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
    en: {
      description: 'A homemade toon shader that blends into the scene',
      body: [
        'A typical emission shader casts no shadows, so characters glow and look out of place. So I built a toon shader as a node group that adds shading and matches the colors of the scene.',
        'Brightness, light color, shadow, rim light, and AO are all adjustable.',
      ],
    },
    genre: 'tool',
    title: 'ToonShader for Blender',
    category: 'TOOL / BLENDER SHADER',
    tools: ['Blender'],
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
    en: {
      title: 'A Certain Famous Underground Passage',
      description: 'A background made to test my toon shader',
      body: [
        'A background I made because I wanted a reflective environment to test ToonShader for Blender.',
        'Time was limited, so the textures are procedural. I also processed external textures with shaders while looking at references, and finished it with post-processing.',
      ],
    },
    genre: 'movie',
    title: '某有名な地下通路',
    category: '3DCG / BACKGROUND',
    tools: ['Blender'],
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
    en: {
      title: 'Avatar Showcase World',
      description: 'A floating sky-garden world for showcasing avatars',
      body: [
        'A VRChat avatar showcase world themed around “a sky garden where you can take a break.” I wanted a world where you do more than just try on avatars.',
        'It has a video player, pedestals for one-click avatar changes, and mirrors for checking how you look.',
      ],
    },
    genre: 'vr',
    title: 'アバター展示ワールド',
    category: 'VRCHAT / WORLD',
    tools: ['Unity', 'Blender'],
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
    en: {
      title: 'Characters 2023–2025',
      description: 'The 3D characters I’ve made so far',
      imageAlt: 'A group shot of more than 20 3D characters I have made, standing in a row',
      body: [
        'I keep making 3D characters with two goals: learning design and improving my 3D skills. Most are avatars for VRChat, and I’ve released many of them for free.',
        'You can see the 3D models of Quiple, Coflet, and Timi in the Avatars room.',
      ],
    },
    genre: 'vr',
    title: '歴代キャラクター 2023–2025',
    category: '3DCG / CHARACTER',
    tools: ['Blender', 'Unity'],
    description: 'これまでに作ってきた3Dキャラクターたち',
    thumbnail: '/works/characters/thumb.webp',
    year: '2023〜2025',
    body: [
      '「デザインの学習」と「3D技術の向上」を目標に、3Dキャラクターを作り続けています。中心はVRChatで使えるアバターで、無料配布もたくさん行ってきました。',
      'Quiple・こふりぃ・Timiは、アバターの部屋で3Dモデルを見られます。',
    ],
    cover: '/works/characters/all.webp',
    imageAlt: 'これまでに作った3Dキャラクター20体あまりを、横一列に並べた集合写真',
  },
  {
    id: 'kcs-cg-movie',
    en: {
      title: 'KCS CG Team Film',
      description: 'Characters, motion, and production management',
      body: [
        '“Door Open” (about 6 minutes), the 2023 film by the KCS 3DCG team.',
      ],
      links: ['Watch on YouTube'],
    },
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
    en: {
      title: 'Character Modeling Even If You Can’t Draw',
      description:
        'A technical zine — Excellence Award at the Gishohaku Awards',
      body: [
        'A 243-page technical zine I wrote on my own, distributed at Techbookfest 15 and the 9th Technical Book Doujinshi Expo (Gishohaku). It received an Excellence Award at the Gishohaku Awards.',
        'I wrote it for my past self, who once gave up after hearing that “you can’t do character modeling if you can’t draw.” It’s written carefully so you won’t get lost even without knowledge of human anatomy.',
        'It covers everything in one book: Blender basics, character modeling, preparing what VRChat needs, setting things up in Unity, and uploading.',
      ],
      links: ['View on BOOTH'],
    },
    genre: 'book',
    title: '絵が描けなくてもキャラモデリング',
    category: 'WRITING',
    tools: ['Blender', 'Unity'],
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
    en: {
      title: 'Techbookfest Circle Exhibits',
      description:
        'Writing, typesetting, and cover art for our club’s technical zines',
      body: [
        'Our club has exhibited at every Techbookfest since Techbookfest 14 (spring 2023). Here is what I worked on:',
        'Techbookfest 14: Wrote “Schools of Variation in Character Modeling” (my first writing)',
        'Techbookfest 15: Wrote and typeset “Character Modeling Even If You Can’t Draw” (solo)',
        'Techbookfest 16: Wrote and typeset “An Intro to Deep Learning, Just for the Vibe”',
        'Techbookfest 17: Wrote and drew the cover for “A Local Voice-Chat AI with VOICEVOX”',
        'Techbookfest 18: Wrote “Naming Methods Faithful to the Story”',
        'Techbookfest 19: Cover illustration',
      ],
      links: ['Circle page on Techbookfest'],
    },
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
    en: {
      description: 'A procedural starry-sky shader and a video explaining it',
      body: [
        'A procedural starry-sky shader based on an existing one (by Joey Carlino), with nebulae, colors, and bright stars added. Like the original, its look can be adjusted with parameters.',
        'I also made and published a video explaining how it’s built.',
      ],
      links: ['Watch the explainer on YouTube'],
    },
    genre: 'tool',
    title: 'Starry Sky',
    category: 'SHADER / BLENDER',
    tools: ['Blender'],
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
    en: {
      description: 'A world made for VRChat',
      body: [
        'A world I made for VRChat. It’s currently published as an alpha version.',
      ],
      links: ['View in VRChat'],
    },
    genre: 'vr',
    title: 'SimpleApartment',
    category: '3DCG / WORLD',
    tools: ['Unity', 'Blender'],
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
