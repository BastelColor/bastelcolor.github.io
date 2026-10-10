/**
 * 公開の前の確認（scripts/smoke-test.mjs）で行う、操作の確認。
 * 画面が表示できるかだけでなく、押したり切りかえたりしたときに、ちゃんと動くかを確かめる。
 *
 * それぞれ { name, run(page, base, context) } の形。context は { avatarId }（書き出したアバターの1体目）。
 * run の中で、思ったとおりでなければ throw する（failIf を使う）。1つの確認は新しいタブで行う。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 条件が成り立たなければ、理由を書いて止める */
function failIf(condition, message) {
  if (condition) throw new Error(message);
}

/** 条件（ページの中で評価する式）が成り立つまで待つ */
const waitFor = (page, fn, timeout = 20_000, ...args) =>
  page.waitForFunction(fn, { timeout, polling: 200 }, ...args);

/** アバターの部屋で、モデルを表示し終わるまで待つ（写真のボタンは、表示できるまで押せない） */
const avatarReady = (page) =>
  waitFor(
    page,
    () =>
      !!document.querySelector('.vrm-error') ||
      document.querySelector('.avatar-room-photo')?.disabled === false,
    120_000,
  );

/** 見せ方のカードで、見出し（label）の行のボタン（text）を押す */
const pressOption = (page, label, text) =>
  page.evaluate(
    (l, t) => {
      const row = [...document.querySelectorAll('.avatar-room-option')].find(
        (item) => item.getAttribute('aria-label') === l,
      );
      [...(row?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent === t)
        ?.click();
    },
    label,
    text,
  );

export const scenarios = [
  {
    name: '部屋を雲から開き、Esc で閉じると雲にフォーカスがもどる',
    run: async (page, base) => {
      await page.goto(base + '/', { waitUntil: 'load' });
      await waitFor(page, () => document.querySelectorAll('.home-menu .puni').length === 4);
      await page.focus('.home-menu .puni');
      await page.keyboard.press('Enter');
      await waitFor(page, () => !!document.querySelector('.room.is-expanded .profile'));
      await waitFor(
        page,
        () => document.activeElement?.getAttribute('aria-label') === 'もどる',
        5_000,
      );
      await page.keyboard.press('Escape');
      await waitFor(page, () => !document.querySelector('.room'), 5_000);
      await waitFor(
        page,
        () => document.activeElement?.classList.contains('puni'),
        5_000,
      );
    },
  },
  {
    name: '暗いテーマに切りかえると夜の空になり、読み込み直しても覚えている',
    run: async (page, base) => {
      await page.goto(base + '/', { waitUntil: 'load' });
      await waitFor(page, () => !!document.querySelector('.corner-tools'));
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.evaluate(() =>
        document.querySelector('.corner-tools .corner-button[aria-label="暗い色にする"]').click(),
      );
      const expected = before === 'dark' ? 'light' : 'dark';
      await waitFor(page, (theme) => document.documentElement.dataset.theme === theme, 5_000, expected);
      if (expected === 'dark') {
        failIf(
          (await page.evaluate(() => document.documentElement.dataset.sky)) !== 'night',
          '暗いテーマなのに、空が夜になっていません',
        );
      }
      await page.reload({ waitUntil: 'load' });
      failIf(
        (await page.evaluate(() => document.documentElement.dataset.theme)) !== expected,
        '読み込み直すと、テーマが元にもどってしまいました',
      );
    },
  },
  {
    name: '英語に切りかえると、雲の文字が英語になる',
    run: async (page, base) => {
      await page.goto(base + '/', { waitUntil: 'load' });
      await waitFor(page, () => !!document.querySelector('.lang-toggle'));
      await page.evaluate(() =>
        [...document.querySelectorAll('.lang-toggle button')].find((b) => b.textContent === 'EN').click(),
      );
      await waitFor(
        page,
        () =>
          document.documentElement.lang === 'en' &&
          !!document.querySelector('.home-menu button[aria-label="Works"]'),
        5_000,
      );
    },
  },
  {
    name: 'さくひん: ジャンルと道具で絞り込み、詳細を開いて閉じる',
    run: async (page, base) => {
      await page.goto(base + '/#works', { waitUntil: 'load' });
      await waitFor(page, () => !!document.querySelector('.room.is-expanded .works-item'));
      await sleep(900);
      const all = await page.$$eval('.works-item', (items) => items.length);
      await page.evaluate(() =>
        [...document.querySelectorAll('.works-genres button')].find((b) => b.textContent === 'ゲーム').click(),
      );
      await sleep(300);
      const games = await page.$$eval('.works-item', (items) => items.length);
      failIf(!(games > 0 && games < all), `ジャンルで絞り込めません（${all} → ${games}）`);
      await page.evaluate(() =>
        [...document.querySelectorAll('.works-genres button')].find((b) => b.textContent === 'すべて').click(),
      );
      const hasTools = await page.evaluate(() => !!document.querySelector('.works-tools'));
      if (hasTools) {
        await page.evaluate(() => document.querySelectorAll('.works-tools button')[1].click());
        await sleep(300);
        const tool = await page.$$eval('.works-item', (items) => items.length);
        failIf(!(tool > 0 && tool < all), `道具で絞り込めません（${all} → ${tool}）`);
      }
      await page.click('.works-item');
      await waitFor(page, () => !!document.querySelector('.work-dialog[open] h3'), 5_000);
      await page.keyboard.press('Escape');
      await waitFor(page, () => !document.querySelector('.work-dialog[open]'), 5_000);
    },
  },
  {
    name: 'アバター: 背景・ライト・表示を切りかえ、写真を保存できる',
    run: async (page, base, { avatarId }) => {
      // 写真の保存（<a download> を押す）を数える
      await page.evaluateOnNewDocument(() => {
        HTMLAnchorElement.prototype.click = function () {
          if (this.download) {
            window.__downloads = (window.__downloads ?? 0) + 1;
            return;
          }
          HTMLElement.prototype.click.call(this);
        };
      });
      await page.goto(base + '/avatar/' + avatarId, { waitUntil: 'load' });
      await avatarReady(page);
      failIf(!!(await page.$('.vrm-error')), '3D モデルを表示できませんでした');
      await page.click('.avatar-room-backdrops .is-night');
      // 背景の波が広がりきると、背景は1枚だけになる
      await waitFor(
        page,
        () =>
          document.querySelector('.avatar-room')?.dataset.backdrop === 'night' &&
          document.querySelectorAll('.avatar-backdrop').length === 1 &&
          document.querySelectorAll('.avatar-room-podium-clip').length === 1,
        5_000,
      );
      await pressOption(page, 'ライト', '夕方');
      await pressOption(page, '表示', 'ワイヤー');
      await sleep(300);
      failIf(
        (await page.$$eval('.avatar-room-option button[aria-pressed="true"]', (buttons) =>
          buttons.map((b) => b.textContent),
        )).filter((text) => text === '夕方' || text === 'ワイヤー').length !== 2,
        'ライトや表示のボタンが切りかわりません',
      );
      await page.click('.avatar-room-photo');
      await waitFor(page, () => (window.__downloads ?? 0) > 0, 15_000);
    },
  },
  {
    name: 'アバター: みんなで並ぶと4人の背丈と「わたし」の線が出る',
    run: async (page, base, { avatarId }) => {
      await page.goto(base + '/avatar/' + avatarId, { waitUntil: 'load' });
      await avatarReady(page);
      await page.evaluate(() =>
        [...document.querySelectorAll('.avatar-room-mode button')].find((b) => b.textContent === 'みんなで並ぶ').click(),
      );
      await waitFor(
        page,
        () =>
          !!document.querySelector('.vrm-error') ||
          [...document.querySelectorAll('.lineup-tags li')].some((li) => /\d+cm/.test(li.textContent)),
        180_000,
      );
      failIf(!!(await page.$('.vrm-error')), 'みんなを表示できませんでした');
      await page.type('#lineup-me', '160');
      await waitFor(page, () => /160cm/.test(document.querySelector('.lineup-mark')?.textContent ?? ''), 5_000);
    },
  },
  {
    name: 'ブログ: 一覧から記事を開き、Esc で一覧へもどる',
    run: async (page, base) => {
      await page.goto(base + '/#log', { waitUntil: 'load' });
      const hasPost = await waitFor(
        page,
        () => !!document.querySelector('.room.is-expanded .log-item'),
        10_000,
      ).then(
        () => true,
        () => false,
      );
      if (!hasPost) return;
      // 部屋が雲から広がりきるまで待つ（広がる途中は、円の外にある記事を押せない）
      await sleep(900);
      await page.click('.log-item');
      await waitFor(page, () => location.pathname.startsWith('/blog/') && !!document.querySelector('.post h1'));
      await sleep(800);
      await page.keyboard.press('Escape');
      await waitFor(page, () => !location.pathname.startsWith('/blog/'), 5_000);
    },
  },
  {
    name: '404: 星をつかまえるあそびが始められる',
    run: async (page, base) => {
      await page.goto(base + '/this-page-does-not-exist', { waitUntil: 'load' });
      await waitFor(page, () => !!document.querySelector('.star-catch-button'));
      await page.click('.star-catch-button');
      await waitFor(page, () => document.querySelectorAll('.star-catch-star').length > 0, 5_000);
      await page.evaluate(() =>
        [...document.querySelectorAll('.star-catch-button')].find((b) => b.textContent === 'おわる').click(),
      );
      await waitFor(page, () => document.querySelectorAll('.star-catch-star').length === 0, 5_000);
    },
  },
  {
    name: 'トップ: 隠しコマンドでみんなが跳ねる',
    run: async (page, base) => {
      await page.goto(base + '/', { waitUntil: 'load' });
      await waitFor(page, () => document.querySelectorAll('.home-menu .puni').length === 4);
      for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
        await page.keyboard.press(key);
      }
      await waitFor(page, () => !!document.querySelector('.home.is-party'), 3_000);
    },
  },
];
