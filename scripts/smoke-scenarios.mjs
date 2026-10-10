/**
 * 公開の前の確認（scripts/smoke-test.mjs）で行う、操作の確認。
 * 画面が表示できるかだけでなく、押したり切りかえたりしたときに、ちゃんと動くかを確かめる。
 *
 * それぞれ { name, run(page, base, context) } の形。context は { avatarId, avatarIds }
 * （書き出したアバターの1体目と、全員）。
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

/** 真ん中の値（ときどき大きくはずれる値に引っぱられないように） */
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** 目線と表情の数字（components/vrm/vrm-stage.ts の StageCheck）を、count 回、間をあけて読む */
const readChecks = async (page, count = 10, ms = 250) => {
  const samples = [];
  for (let i = 0; i < count; i++) {
    await sleep(ms);
    samples.push(await page.evaluate(() => window.__yzmoCheck?.()));
  }
  return samples.filter(Boolean);
};

/** 目線の確かめ方の目安（度・m） */
const GAZE = {
  /** 目の位置と頭の骨のへだたり。これより遠いと、目の位置の計算がおかしい */
  eyeOffset: 0.25,
  /** 見ている人を見ているとき、黒目の上下・左右の向き（真ん中の値）がこれより大きいと、よそ見に見える */
  eyePitch: 12,
  eyeYaw: 20,
  /** 顔の下向き（真ん中の値）がこれより大きいと、うつむいて見える */
  headDown: 12,
};

/** アバターの部屋で、名前（label）の付いたボタンのまとまり（ライト・表示）の、ボタン（text）を押す */
const pressOption = (page, label, text) =>
  page.evaluate(
    (l, t) => {
      const row = [...document.querySelectorAll('.avatar-room fieldset')].find(
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
    name: '右上の星のボタンで動きを減らすと、流れ星が消え、読み込み直しても覚えている',
    run: async (page, base) => {
      await page.goto(base + '/', { waitUntil: 'load' });
      await waitFor(page, () => !!document.querySelector('.corner-tools'));
      const before = await page.evaluate(() => document.documentElement.dataset.motion);
      await page.evaluate(() =>
        document.querySelector('.corner-tools .corner-button[aria-label="動きを減らす"]').click(),
      );
      const expected = before === 'reduce' ? 'full' : 'reduce';
      await waitFor(page, (motion) => document.documentElement.dataset.motion === motion, 5_000, expected);
      if (expected === 'reduce') {
        failIf(
          await page.evaluate(() => {
            const stars = document.querySelector('.shooting-stars');
            return !!stars && getComputedStyle(stars).display !== 'none';
          }),
          '動きを減らしても、流れ星が出ています',
        );
      }
      await page.reload({ waitUntil: 'load' });
      failIf(
        (await page.evaluate(() => document.documentElement.dataset.motion)) !== expected,
        '読み込み直すと、動きの設定が元にもどってしまいました',
      );
      // ブラウザに覚えた設定は、ほかの確認にも効いてしまう（404 のあそびが出なくなるなど）ので、元にもどす
      await page.evaluate(() => window.localStorage.removeItem('yzmo-motion'));
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
    name: 'さくひん: ジャンルと道具で絞り込み、詳細を開いて、となりの作品へ移り、閉じる',
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
      // ← → キーと下の矢印で、となりの作品へ移れる
      const title = () => page.evaluate(() => document.querySelector('.work-dialog[open] h3')?.textContent);
      const first = await title();
      await page.keyboard.press('ArrowRight');
      await sleep(400);
      const second = await title();
      failIf(second === first, '→ キーで、次の作品へ移れません');
      await page.click('.work-detail-step.is-previous');
      await sleep(400);
      failIf((await title()) !== first, '前の作品の矢印で、もどれません');
      await page.keyboard.press('Escape');
      await waitFor(page, () => !document.querySelector('.work-dialog[open]'), 5_000);
    },
  },
  {
    name: 'アバター: 揺らす・風・背景・ライト・表示を切りかえ、写真を保存できる',
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
      // 揺れもの: ゆらす・風
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.avatar-room-play button')];
        buttons.find((button) => button.textContent === 'ゆらす')?.click();
        buttons.find((button) => button.textContent === '風をふかせる')?.click();
      });
      await sleep(500);
      failIf(
        (await page.$$eval('.avatar-room-play button[aria-pressed="true"]', (buttons) =>
          buttons.map((button) => button.textContent),
        )).includes('風をふかせる') === false,
        '風のボタンが切りかわりません',
      );
      await pressOption(page, 'ライト', '夕方');
      await pressOption(page, '表示', 'ワイヤー');
      await sleep(300);
      failIf(
        (await page.$$eval('.avatar-room fieldset button[aria-pressed="true"]', (buttons) =>
          buttons.map((b) => b.textContent),
        )).filter((text) => text === '夕方' || text === 'ワイヤー').length !== 2,
        'ライトや表示のボタンが切りかわりません',
      );
      await page.click('.avatar-room-photo');
      await waitFor(page, () => (window.__downloads ?? 0) > 0, 15_000);
    },
  },
  {
    name: 'アバター: どの子も、目線が自然で、表情のボタンで顔が変わる',
    run: async (page, base, { avatarIds }) => {
      for (const id of avatarIds) {
        // ?check を付けると、目線と表情の数字が読める（components/vrm/vrm-stage.ts）
        await page.goto(`${base}/avatar/${id}?check`, { waitUntil: 'load' });
        await avatarReady(page);
        failIf(!!(await page.$('.vrm-error')), `${id}: 3D モデルを表示できませんでした`);
        await waitFor(page, () => !!window.__yzmoCheck, 10_000);
        // マウスがモデルの外にあるとき: 見ている人を見る
        await page.mouse.move(5, 5);
        const idle = await readChecks(page);
        failIf(idle.length === 0, `${id}: 目線の数字が読めません`);
        const offset = Math.max(...idle.map((item) => item.eyeOffset));
        failIf(
          offset > GAZE.eyeOffset,
          `${id}: 目の位置が頭から ${offset.toFixed(2)}m 離れています（黒目が変な向きになります）`,
        );
        const pitch = median(idle.map((item) => item.eyePitch));
        const yaw = median(idle.map((item) => item.eyeYaw));
        failIf(
          Math.abs(pitch) > GAZE.eyePitch || Math.abs(yaw) > GAZE.eyeYaw,
          `${id}: 見ている人を見ていません（黒目の上下 ${pitch.toFixed(1)}°・左右 ${yaw.toFixed(1)}°）`,
        );
        const head = median(idle.map((item) => item.headPitch));
        failIf(head < -GAZE.headDown, `${id}: うつむいています（顔の向き ${head.toFixed(1)}°）`);

        // マウスを顔のあたりに置いたとき: そちらを見る（黒目が極端な向きにならない）
        const face = await page.evaluate(() => {
          const rect = document.querySelector('.avatar-room-stage').getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.2 };
        });
        await page.mouse.move(face.x, face.y);
        const looking = await readChecks(page, 6);
        const lookingPitch = median(looking.map((item) => item.eyePitch));
        failIf(
          Math.abs(lookingPitch) > GAZE.eyePitch,
          `${id}: 顔のあたりのマウスを見たとき、黒目が上下に寄りすぎています（${lookingPitch.toFixed(1)}°）`,
        );
        await page.mouse.move(5, 5);

        // 表情のボタン: 押すと、その表情になる。しばらくすると、ふだんの顔にもどる
        const labels = await page.$$eval('.avatar-room-play', (cards) =>
          [...(cards[0]?.querySelectorAll('button') ?? [])].map((button) => button.textContent),
        );
        failIf(labels.length === 0, `${id}: 表情のボタンがありません`);
        for (const label of labels) {
          await page.evaluate((text) => {
            const card = document.querySelectorAll('.avatar-room-play')[0];
            [...card.querySelectorAll('button')].find((button) => button.textContent === text)?.click();
          }, label);
          await sleep(900);
          const shown = await page.evaluate(() => window.__yzmoCheck?.().expressions ?? {});
          failIf(
            !Object.values(shown).some((value) => value > 0.8),
            `${id}: 「${label}」を押しても、顔が変わりません`,
          );
        }
        await waitFor(
          page,
          () => Object.values(window.__yzmoCheck?.().expressions ?? {}).every((value) => value < 0.05),
          6_000,
        ).catch(() => {
          throw new Error(`${id}: 表情が、ふだんの顔にもどりません`);
        });
      }
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
