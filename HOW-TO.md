# 關西行程資料轉換

## 檔案
- `scripts/sheet-to-json.mjs`：把 Google Sheet 匯出的 CSV 轉成 `data/*.json`（不用 npm install）
- `data/`：給 PWA 讀的公開資料，可以 commit
- `private/private.json`：預約編號、訂單號碼，**不要 commit**
- `sheet-export/`：Sheet 匯出的原始 CSV，**不要 commit**（裡面有預約編號）
- `.gitignore`：已經把上面兩個資料夾排除

## Sheet 有改的時候
1. Google Sheet → 檔案 → 下載 → 逗號分隔值（.csv），下載「總覽」「行程明細」「待辦事項」「伴手禮清單」4 個分頁
2. 分別改名成 `overview.csv`、`itinerary.csv`、`todos.csv`、`souvenirs.csv`，放進 `sheet-export/`
3. 執行 `node scripts/sheet-to-json.mjs`
4. 看到 ⚠️ 就照提示檢查那幾個項目有沒有編號沒遮到

## 放進 seoul-walks 複製出來的新 repo 時要改的地方（index.html）
- `loadData()` 裡 `{ length: 4 }` → 改成 `8`
- `jsons.slice(0, 4)`、`jsons[4]`、`jsons[5]` 寫死了天數 → 改成
  `jsons.slice(0, dayFiles.length)`、`jsons.at(-2)`、`jsons.at(-1)`
- 頁首寫死的「KST」「首爾，旅程開始」要改成 JST／關西
- `sw.js` 和 `index.html` 的快取名稱 `seoul-walks-v1` 一起改，例如 `kansai-walks-v1`
- `manifest.json` 的 `start_url` 改成新的 repo 名稱

## 新增的欄位（舊畫面會忽略，做新畫面時可以用）
| 欄位 | 值 |
|---|---|
| `type` | `transport` `sight` `food` `hotel` `shopping` `activity` |
| `status` | `booked` `todo` `buyOnSite` `queue` `none` `unconfirmed` |
| `payment` | `paid` `onSite` |
| `cost` | 數字（日圓，2 人） |
| `optional` | `true` 代表選配行程 |
| `tags` | 交通標籤陣列，例如 `["JR","步行"]` |
| `booking` | 預約方式（編號已遮成 ●●●） |
| 每天的 `isoDate`、`route` | 自動跳到今天、首頁顯示路線用 |
