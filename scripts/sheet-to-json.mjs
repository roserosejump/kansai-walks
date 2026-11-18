#!/usr/bin/env node
/**
 * 把 Google Sheet「🍁 關西賞楓行程 2026」匯出的 CSV 轉成 PWA 用的 JSON。
 *
 * 用法：
 *   1. Google Sheet → 檔案 → 下載 → 逗號分隔值 (.csv)，每個分頁各下載一次，
 *      依下方 INPUT 的檔名放進 sheet-export/
 *   2. node scripts/sheet-to-json.mjs
 *   3. 產出：
 *      data/day1.json ~ dayN.json、data/checklist.json、data/config.json  → 可以 commit
 *      private/private.json（預約編號、訂單號碼等）                        → 已在 .gitignore，不要 commit
 *
 * 不需要 npm install，只用 Node 內建模組（Node 18+）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = {
  overview: 'sheet-export/overview.csv', // 總覽
  itinerary: 'sheet-export/itinerary.csv', // 行程明細
  todos: 'sheet-export/todos.csv', // 待辦事項
  souvenirs: 'sheet-export/souvenirs.csv', // 伴手禮清單
};
const YEAR = 2026;

// ─────────────────────────────────────────────
// 1. Sheet 的中文值 → 程式用的 enum
//    前端只認 enum，顯示文字由前端自己決定（之後換語言、換 badge 樣式都不用改資料）
// ─────────────────────────────────────────────
const STATUS = {
  '✅ 已預約': 'booked',
  '⏳ 待預約': 'todo',
  '🎫 現場購票': 'buyOnSite',
  '🚶 現場排隊': 'queue',
  '— 不需預約': 'none',
  '❓ 待確認': 'unconfirmed',
};
const PAYMENT = { 已付款: 'paid', 現場付: 'onSite' };
const TYPE = {
  交通: 'transport',
  景點: 'sight',
  餐廳: 'food',
  住宿: 'hotel',
  購物: 'shopping',
  活動: 'activity',
};

// 交通標籤：依出現順序抓關鍵字，給前端做彩色小標籤
const TRANSPORT_TAGS = [
  [/SL\d+|GK\d+|航班/, '✈️ 飛機'],
  [/HARUKA/, 'HARUKA'],
  [/小火車/, '嵯峨野小火車'],
  [/JR/, 'JR'],
  [/地鐵|御堂筋|堺筋|烏丸線/, '地鐵'],
  [/京阪(?!京都交通)/, '京阪'],
  [/近鐵/, '近鐵'],
  [/阪急/, '阪急'],
  [/南海/, '南海'],
  [/巴士|系統/, '巴士'],
  [/纜車/, '纜車'],
  [/計程車/, '計程車'],
  [/開車/, '開車'],
  [/步行|走到|走回/, '步行'],
];

// ─────────────────────────────────────────────
// 2. 敏感資料：預約編號、訂單號碼、門票號碼不能出現在公開的 GitHub repo
// ─────────────────────────────────────────────
// 「關鍵字 + 編號」：例如「予約番号 ABC123」「預約番號 SAMPLE5678」
const SECRET_LABELED =
  /((?:予約番号|預約番[號号]|預約 ?ID|預約代碼|預約編號|訂單|認証コード|門票|查詢編號|Tabelog 預約|TableCheck 預約)[ ：:]*)([A-Za-z0-9-]{4,})/g;
// 沒有關鍵字、但長得像編號的 token：6 碼以上、同時有英文和數字，例如 DEMO12AB34CD、XY9Z88Q
const SECRET_TOKEN = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PERSONAL = [[/板橋合宜一路/g, '家']]; // 家裡地址之類，直接換掉
const MASK = '●●●';

function mask(text) {
  if (!text) return { text, masked: false };
  let out = text
    .replace(SECRET_LABELED, (_, label) => `${label}${MASK}`)
    .replace(SECRET_TOKEN, MASK)
    .replace(EMAIL, MASK);
  for (const [re, to] of PERSONAL) out = out.replace(re, to);
  return { text: out, masked: out !== text };
}

// ─────────────────────────────────────────────
// 3. 小工具
// ─────────────────────────────────────────────
/** 支援雙引號、欄位內換行的 CSV parser（Sheet 的備註欄有換行，不能用 split） */
function parseCsv(src) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const readCsv = (path) => parseCsv(readFileSync(join(ROOT, path), 'utf8'));
const writeJson = (path, data) => {
  const full = join(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2) + '\n');
};
const WEEKDAY = { 日: '週日', 一: '週一', 二: '週二', 三: '週三', 四: '週四', 五: '週五', 六: '週六' };
const toIsoDate = (md) => {
  const [m, d] = md.split('/').map(Number);
  return `${YEAR}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const toNumber = (v) => {
  const n = Number(String(v).replace(/[¥,\s]/g, ''));
  return Number.isFinite(n) && String(v).trim() !== '' ? n : undefined;
};
/** 把 undefined / 空字串 / 空陣列的欄位拿掉，JSON 比較乾淨 */
const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  );

function pickIcon(type, title) {
  if (type === 'transport') {
    if (/SL\d|GK\d/.test(title)) return '✈️';
    if (/小火車/.test(title)) return '🚂';
    if (/計程車/.test(title)) return '🚕';
    if (/^(步行|走)/.test(title)) return '🚶';
    return '🚃';
  }
  if (type === 'food') {
    if (/喫茶|COFFEE|café|珈琲|咖啡/i.test(title)) return '☕';
    if (/泡芙|糰子|麻糬|抹茶|甜點|布丁/.test(title)) return '🍡';
    if (/燒肉|焼肉/.test(title)) return '🥩';
    if (/串/.test(title)) return '🍢';
    if (/早餐|便利商店/.test(title)) return '🥐';
    return '🍜';
  }
  if (type === 'sight') {
    if (/遊船|クルーズ/.test(title)) return '⛵';
    if (/寺|神社|大社/.test(title)) return '⛩️';
    if (/USJ|遊樂園|快通|侏羅紀|哈利|任天堂|遊行|夜間秀|入園/.test(title)) return '🎢';
    if (/HARUKAS|通天閣/.test(title)) return '🗼';
    if (/teamLab/i.test(title)) return '✨';
    return '📍';
  }
  return { hotel: '🏨', shopping: '🛍️', activity: '👘' }[type] ?? '📍';
}

const transportTags = (text) =>
  TRANSPORT_TAGS.filter(([re]) => re.test(text)).map(([, label]) => label);

// ─────────────────────────────────────────────
// 4. 轉換
// ─────────────────────────────────────────────
function buildDays(overviewRows, itineraryRows, privateItems) {
  // 總覽：Day, 日期, 星期, 地區, 主題／重點, 住宿
  const meta = new Map(
    overviewRows
      .filter((r) => /^D\d+$/.test(r[0]))
      .map(([day, date, wd, region, route, hotel]) => [day, { date, wd, region, route, hotel }]),
  );

  const days = [];
  let current = null;
  for (const [rawDay, , start, end, area, rawTitle, rawType, rawStatus, booking, cost, notes, rawPay] of itineraryRows.slice(1)) {
    // A、B 欄在 Sheet 是合併儲存格，CSV 只有第一列有值 → 往下沿用
    if (rawDay) {
      const m = meta.get(rawDay);
      current = {
        day: Number(rawDay.slice(1)),
        date: m.date,
        isoDate: toIsoDate(m.date),
        wd: WEEKDAY[m.wd] ?? m.wd,
        // 用總覽的「地區」當城市，例如「京都→大阪」「奈良・生駒」；用行程的地區欄會太細（京都站、烏丸御池…）
        cities: m.region.split(/[→・]/).map((c) => c.trim()).filter(Boolean),
        hotel: m.hotel || '',
        highlight: m.region,
        route: m.route,
        items: [],
      };
      days.push(current);
    }

    const type = TYPE[rawType] ?? 'sight';
    const optional = rawTitle.startsWith('（選配）');
    const hoursMatch = rawTitle.match(/\s*\[([^\]]+)\]\s*$/);
    const title = mask(rawTitle.replace('（選配）', '').replace(/\s*\[[^\]]+\]\s*$/, '').trim()).text;
    const id = `${current.day}-${current.items.length + 1}`;
    const status = STATUS[rawStatus] ?? 'none';

    const publicNotes = mask(notes);
    const publicBooking = mask(booking);
    if (publicNotes.masked || publicBooking.masked) {
      privateItems[id] = compact({ title, booking: booking || undefined, notes: publicNotes.masked ? notes : undefined });
    }

    // 交通標籤先看標題，標題沒寫交通方式（例如「家 → 桃園機場」）再看備註
    const tags =
      type === 'transport'
        ? [transportTags(title), transportTags(notes ?? '')].find((t) => t.length > 0)
        : undefined;

    const item = compact({
      id,
      time: end ? `${start}–${end}` : start,
      icon: pickIcon(type, title),
      title,
      area,
      type,
      status,
      payment: PAYMENT[rawPay],
      cost: toNumber(cost),
      optional: optional || undefined,
      hours: hoursMatch?.[1],
      trs: tags?.join('・'),
      tags,
      booking: publicBooking.text,
      desc: publicNotes.text,
      mapUrl:
        ['food', 'sight', 'shopping', 'activity'].includes(type)
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title.split(/[／（(→]/)[0].trim()} ${area}`)}`
          : undefined,
      // seoul-walks 現有畫面認得的兩個旗標
      isReserved: status === 'booked' && type === 'food' ? true : undefined,
      isTicket: status === 'booked' && ['sight', 'activity'].includes(type) ? true : undefined,
    });
    current.items.push(item);
  }
  return days;
}

function buildChecklist(todoRows, souvenirRows) {
  // 待辦事項：完成, 優先, 期限, 事項, 相關天數, 怎麼做, 備註
  const groups = { '🔴 優先處理': [], '🟡 出發前完成': [], '🟢 有空再做': [] };
  const groupOf = (p) => (p.includes('高') ? '🔴 優先處理' : p.includes('中') ? '🟡 出發前完成' : '🟢 有空再做');
  todoRows.slice(1).forEach(([done, priority, deadline, text, day], i) => {
    if (!text || done === 'TRUE' || done === 'True') return;
    groups[groupOf(priority)].push(
      compact({ id: `t${i + 1}`, date: [day, deadline].filter(Boolean).join('｜'), text: mask(text).text }),
    );
  });

  // 伴手禮清單：已買, 品牌／名稱, 推薦品項, 地點, 哪天順路買, 大概價格, 保存期限, 帶回台灣, 用途, 備註
  const SHOP_DEF = souvenirRows
    .slice(1)
    .filter((r) => r[1])
    .map(([, brand, item, place, day], i) => ({
      id: `s${i + 1}`,
      text: `${brand}｜${item}`,
      ...compact({ place, day }),
    }));

  return { GTASKS: groups, SHOP_DEF };
}

function buildConfig(days) {
  const dates = days.map((d) => d.isoDate);
  const datesOf = (...dayNums) => dayNums.map((n) => dates[n - 1]);
  return {
    title: '🍁 關西賞楓之旅 2026',
    shortTitle: 'Kansai 2026',
    theme: 'latte',
    currency: { from: 'JPY', to: 'TWD', referenceRate: 0.21 },
    tripStartDate: dates[0],
    tripEndDate: dates.at(-1),
    cities: {
      Kyoto: { lat: 35.0116, lon: 135.7681, label: '京都', days: datesOf(1, 2, 4) },
      Arashiyama: { lat: 35.0094, lon: 135.6668, label: '嵐山', days: datesOf(3) },
      Osaka: { lat: 34.6687, lon: 135.5013, label: '大阪', days: datesOf(4, 5, 7, 8) },
      Nara: { lat: 34.6851, lon: 135.8048, label: '奈良・生駒', days: datesOf(6) },
      Minoh: { lat: 34.8667, lon: 135.4917, label: '箕面・勝尾寺', days: datesOf(7) },
    },
  };
}

// ─────────────────────────────────────────────
// 5. 執行
// ─────────────────────────────────────────────
const privateItems = {};
const days = buildDays(readCsv(INPUT.overview), readCsv(INPUT.itinerary), privateItems);
days.forEach((d) => writeJson(`data/day${d.day}.json`, d));
writeJson('data/checklist.json', buildChecklist(readCsv(INPUT.todos), readCsv(INPUT.souvenirs)));
writeJson('data/config.json', buildConfig(days));
writeJson('private/private.json', { note: '預約編號、訂單號碼等，不要 commit', items: privateItems });

// 最後再掃一次公開檔案，確保沒有漏網的編號
// 注意：帶 /g 的 regex 用 .test() 會記住 lastIndex，連續呼叫結果會錯，所以這裡另外建不帶 g 的版本
const looksSecret = new RegExp(`${SECRET_TOKEN.source}|${EMAIL.source}`);
const leaks = days.flatMap((d) =>
  d.items.filter((it) => [it.desc, it.booking, it.title].some((t) => t && looksSecret.test(t))),
);
console.log(
  `✅ ${days.length} 天、${days.reduce((n, d) => n + d.items.length, 0)} 個行程項目` +
    `，${Object.keys(privateItems).length} 筆敏感資料移到 private/private.json`,
);
if (leaks.length) {
  console.warn('⚠️ 這些項目可能還有編號沒遮到，請手動檢查：', leaks.map((it) => it.id));
  process.exitCode = 1;
}
