/**
 * 見ている人の端末で起きた不具合（lib/report-error.ts が GoatCounter に送る error/… のできごと）を、
 * 多い順に一覧にする。
 *
 *   npm run errors              この 30 日
 *   npm run errors -- --days 7  この 7 日
 *
 * GoatCounter の API の鍵（読むだけのもの）が要る。鍵は GitHub に送らず、この PC の中だけに置く。
 *   1. https://<コード>.goatcounter.com/user/api で「New API token」を作る（権限は「Read statistics」だけ）
 *   2. PowerShell なら  $env:GOATCOUNTER_TOKEN = "作った鍵"  のあとに  npm run errors
 *      （毎回入れるのが面倒なら、Windows の「環境変数」に GOATCOUNTER_TOKEN として登録しておく）
 * GoatCounter のコードは content/site.ts の goatcounter から読む。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteSource = await readFile(path.join(root, 'content', 'site.ts'), 'utf8');
const code = /goatcounter:\s*'([^']*)'/.exec(siteSource)?.[1];
if (!code) {
  console.log('[errors] content/site.ts の goatcounter が空なので、数えていません');
  process.exit(0);
}
const token = process.env.GOATCOUNTER_TOKEN;
if (!token) {
  console.log(`[errors] GoatCounter の API の鍵がありません。
  https://${code}.goatcounter.com/user/api で、「Read statistics」だけの鍵を作り、
  PowerShell なら  $env:GOATCOUNTER_TOKEN = "作った鍵"  のあとに、もう一度 npm run errors してください。`);
  process.exit(1);
}

const daysIndex = process.argv.indexOf('--days');
const days = daysIndex > 0 ? Math.max(1, Number(process.argv[daysIndex + 1]) || 30) : 30;
const end = new Date();
const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
const day = (date) => date.toISOString().slice(0, 10);

/** error/ で始まるできごとを、すべて集める（100 個ずつ） */
const rows = [];
const seen = [];
for (let page = 0; page < 20; page++) {
  const params = new URLSearchParams({
    start: day(start),
    end: day(end),
    filter: 'error/',
    limit: '100',
  });
  if (seen.length) params.set('exclude_paths', seen.join(','));
  const response = await fetch(`https://${code}.goatcounter.com/api/v0/stats/hits?${params}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    console.log(`[errors] GoatCounter から読めませんでした（${response.status}）: ${(await response.text()).slice(0, 200)}`);
    if (response.status === 401 || response.status === 403) {
      console.log('[errors] 鍵がまちがっているか、「Read statistics」の権限がありません。');
    }
    process.exit(1);
  }
  const data = await response.json();
  for (const hit of data.hits ?? []) {
    seen.push(hit.path_id);
    if (!String(hit.path).startsWith('error/')) continue;
    rows.push({ path: hit.path, count: hit.count ?? 0 });
  }
  if (!data.more) break;
}

if (rows.length === 0) {
  console.log(`[errors] この ${days} 日、端末で起きた不具合はありませんでした`);
  process.exit(0);
}
rows.sort((a, b) => b.count - a.count);
// error/<どこで>/<エラーの文>
const width = Math.max(...rows.map((row) => String(row.count).length));
console.log(`[errors] この ${days} 日に、端末で起きた不具合（多い順）`);
for (const row of rows) {
  const [, where = '?', ...message] = row.path.split('/');
  console.log(`  ${String(row.count).padStart(width)} 回  [${where}] ${message.join('/')}`);
}
console.log(`  どの端末・ブラウザで起きたかは https://${code}.goatcounter.com で、その行を押すと見られます`);
