# 怎麼改資料

行程資料**全部直接在 `data/` 裡編輯**，不再用 Google Sheet 轉檔。改完請先跑檢查，再 push。

```
python3 scripts/check-data.py        # 改完資料先跑；有「錯誤」就不要 push
```

> `scripts/sheet-to-json.mjs` 是舊的 Sheet 轉檔腳本，**已停用**。它會用 Sheet 的舊資料整個覆蓋 `data/`，你改過的東西會全部消失，所以現在要加 `--force` 才會執行。**不要跑它。**

---

## 一、檔案地圖：想改什麼，改哪個檔

| 想改的東西 | 改這個檔 |
|---|---|
| 某個行程的時間、完整名稱、備註、地圖連結、預約狀態、費用 | `data/day1.json` … `day8.json` |
| 行程在列表上顯示的**一句話短標題** | `data/short-titles.json` |
| 每天的**一句話主題**（詩意那句） | `data/day-themes.json` |
| 每天經過的**城市**（京都 → 大阪） | `data/day-cities.json` |
| 某個行程**怎麼去**（交通說明） | `data/access.json` |
| **航班**的行李、餐點、報到截止 | `data/flights.json` |
| 待辦事項、購物清單 | `data/checklist.json` |
| 標題、天數、日期、天氣城市 | `data/config.json` |

行程之間靠每個行程的 **`id`**（例如 `3-7`）對應：短標題、交通說明都用 `id` 當 key。

---

## 二、常見操作

### 改一個行程的文字／時間
直接改 `dayN.json` 裡那個行程。行程在畫面上的**順序就是它在 `items` 陣列裡的順序**，不是 `id` 的大小。

- `time` 的格式：`08:00–08:15`（有結束時間）或 `20:25`（只有開始）。「現在／下一站」是靠它判斷的，格式錯了那一項會被略過。
- 名稱太長就改 `short-titles.json` 的短標題，完整名稱留在 `dayN.json`。

### 新增一個行程
1. 在 `dayN.json` 的 `items` 裡，放到你要的位置，加一個物件。至少要有 `id`、`time`、`title`、`type`：
   ```json
   {
     "id": "3-16",
     "time": "21:00",
     "title": "完整名稱",
     "area": "嵐山",
     "type": "food",
     "status": "none",
     "mapUrl": "https://www.google.com/maps/search/?api=1&query=店名%20地區"
   }
   ```
2. **`id` 取一個沒用過的**（同一天裡接著編下去，例如現在最大是 `3-15` 就用 `3-16`）。**不要重複使用**，也不用依順序，**更不要重新編號**，其他檔案都靠 `id` 對應。
3. 到 `short-titles.json` 加一行短標題：`"3-16": "晚餐 某某店"`（沒加也不會壞，只是會顯示完整標題）。
4. 需要的話到 `access.json` 加「怎麼去」。
5. 跑 `python3 scripts/check-data.py`。

### 刪除一個行程
從 `dayN.json` 刪掉那個物件，**同時**把 `short-titles.json`、`access.json` 裡同一個 `id` 刪掉（檢查工具會提醒你還有殘留）。**其他行程的 `id` 不要動。**

### 新增一整天
1. 複製一個 `dayN.json` 成 `day9.json`，改 `day`（9）、`date`、`isoDate`、`wd`、`hotel`、`items`。
2. `config.json`：`days` 改 9、`tripEndDate` 改成新的最後一天。
3. `day-themes.json`、`day-cities.json` 加上 `"9"`。
4. 跑檢查。

### 改航班資訊
`flights.json` 的 key 是航班編號，要和行程標題開頭的一樣（標題是「SL396 桃園 → 關西」，key 就是 `SL396`）：
```json
"SL396": { "airline": "泰獅航空", "checked": "20kg", "carryOn": "7kg", "meal": false }
```
`meal` 是 `true`／`false`；`checkinDeadline`（報到截止，例如 `"21:25"`）可以省略。

### 寫「怎麼去」（`access.json`）
```json
"3-8": ["花筏走到竹林約 10 分"],
"4-5": ["JR 奈良線 → 東福寺（1 站）→ 轉京阪 → 祇園四条 → 步行約 5–10 分"]
```
- 用「→」連接各段，畫面會把箭頭標成楓紅色、「約 N 分」加粗。
- 如果同一句話原本就寫在 `desc` 備註裡，句子要和備註**完全一樣**，備註那邊才會自動隱藏；不一樣就是兩邊都顯示。
- 空陣列 `[]` 代表刻意不顯示。

---

## 三、預約編號：不要放進 repo

- repo 是**公開**的。**真的預約編號、訂單號碼不能出現在任何會 commit 的檔案裡**，請存在 LINE 記事本。
- 資料裡預約欄位請寫 `●●●`，畫面會自動顯示成「LINE 記事本」小標籤，例如：`"booking": "預約番號 ●●●（reserve.489ban.net）"`。
- 檢查工具會掃「預約番號／訂單／確認碼…後面接英數字」的寫法，抓到就報錯。它只抓得到「有關鍵字」的寫法，所以**請自己也留意**：不要把編號單獨寫在備註裡。
- `private/` 和 `sheet-export/` 是舊轉檔留下的本機資料（含編號），**不會也不能 commit**，已寫在 `.gitignore`。
- 腳本註解、文件、範例裡，**不要拿真實編號當範例**。

push 前再確認一次：
```
git status --short                    # 不該出現 private/ 或 sheet-export/
git ls-files private sheet-export     # 沒有輸出才對
```

---

## 四、改完怎麼更新到網站

```
python3 scripts/check-data.py         # 沒有錯誤才繼續
git add -A
git commit -m "說明你改了什麼"
git push
```

push 之後約 1–3 分鐘建置，再加上瀏覽器快取約 10 分鐘，手機才會看到新版。

**手機一直是舊畫面時：** 把 `sw.js` 的 `CACHE_NAME` 與 `index.html` 的 `SW_CACHE_NAME` **一起** +1（兩處必須相同，例如 `v4` → `v5`），再 push。

---

## 附：`day*.json` 每個行程的欄位

| 欄位 | 值 |
|---|---|
| `id` | 固定的名字，例如 `3-7`（新增時取沒用過的） |
| `time` | `08:00–08:15` 或 `20:25` |
| `title` | 完整名稱 |
| `area` | 地點（資訊表的「地點」） |
| `type` | `transport` `sight` `food` `hotel` `shopping` `activity` |
| `status` | `booked` `todo` `buyOnSite` `queue` `none` `unconfirmed` |
| `payment` | `paid` `onSite` |
| `cost` | 數字（日圓，2 人） |
| `optional` | `true` 代表選配行程 |
| `tags` | 交通標籤，例如 `["JR","步行"]`；可用：步行、JR、地鐵、巴士、京阪、阪急、近鐵、南海、HARUKA、✈️ 飛機、計程車、纜車、嵯峨野小火車、開車 |
| `hours` | 營業時間 |
| `booking` | 預約方式（編號請寫 `●●●`） |
| `desc` | 備註，一行一條（用 `\n` 換行）；含「取消、一定、最晚、截止、未到、不能、禁」的句子會自動放進「重點」框 |
| `mapUrl` | Google Maps 搜尋連結（導航按鈕用） |
| 每天的 `isoDate` | 用來判斷「今天」 |

### 畫面上的圖示怎麼決定

時間軸每一列前面的線條圖示，是依「行程類型」加上**`icon` 欄位的 emoji** 決定的（`icon` 本身不會顯示在畫面上，只當分類用）：

| 行程類型 | 怎麼分 | 圖示 |
|---|---|---|
| 景點 `sight` | `icon` 是 ⛩️ | 鳥居（寺廟神社） |
| | `icon` 是 🎢 | 摩天輪（遊樂園） |
| | `icon` 是 ⛵ | 帆船（遊船） |
| | `icon` 是 🗼 | 塔（塔、夜景） |
| | `icon` 是 ✨ | 閃亮星星（teamLab、中崎町散步） |
| | `icon` 是 🍁 | 楓葉（賞楓景點：京都的寺廟、嵐山祐齋亭） |
| | 其他（例如 📍） | 相機（通用的「景點」） |
| 活動 `activity` | `icon` 是 👘 | 和服；其他用星星 |
| 購物 `shopping` | — | 購物袋 |
| 餐飲 `food` | 短標題以「點心」「咖啡」開頭 | 咖啡杯 |
| | 其他 | 刀叉 |
| 旅館 `hotel` | — | 床 |
| 交通 `transport` | 標籤只有「步行」 | 走路小人 |
| | 標籤有「計程車」或「開車」 | 汽車 |
| | 標籤有「✈️ 飛機」 | 紙飛機 |
| | `icon` 是 🛂 | 護照（入境） |
| | 其他 | 電車 |

新增景點時，把 `icon` 設成上面對應的 emoji 就會用對圖示；`icon` 沒填或不在表裡，景點會用相機。
