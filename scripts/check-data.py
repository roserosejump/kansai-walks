#!/usr/bin/env python3
"""
資料檢查：直接改過 data/ 之後、push 之前跑一次。

    python3 scripts/check-data.py

會檢查：
  - 所有 JSON 格式有沒有打錯（多逗號、少引號）
  - 行程 id 有沒有重複、天數與 config.json 是否一致
  - 短標題／交通說明有沒有對到不存在的 id、有沒有行程沒有短標題
  - 航班有沒有資料、每天的主題與城市有沒有漏
  - 有沒有不小心把真的預約編號寫進去（只要看到「預約番號 後面接英數字」就報錯）

有「錯誤」會回傳 1（不要 push）；「提醒」只是建議，不會擋。
只用 Python 內建模組，不用安裝任何東西。
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(ROOT)
errors, warns = [], []
err = errors.append
warn = warns.append


def load(path, required=True):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        if required:
            err(f'找不到 {path}')
        return None
    except json.JSONDecodeError as e:
        err(f'{path} 格式錯誤：第 {e.lineno} 行第 {e.colno} 欄（{e.msg}）')
        return None


# ── 讀檔 ──────────────────────────────────────────────
config = load('data/config.json')
checklist = load('data/checklist.json')
short = load('data/short-titles.json', False) or {}
access = load('data/access.json', False) or {}
themes = load('data/day-themes.json', False) or {}
cities = load('data/day-cities.json', False) or {}
flights = load('data/flights.json', False) or {}

day_files = sorted(glob.glob('data/day[0-9]*.json'), key=lambda p: int(re.search(r'day(\d+)\.json', p).group(1)))
days = [load(p) for p in day_files]
if any(d is None for d in days) or config is None:
    print('\n'.join(f'錯誤：{e}' for e in errors))
    sys.exit(1)

# ── 天數與日期 ─────────────────────────────────────────
n = len(days)
if config.get('days') != n:
    err(f'config.json 的 days 是 {config.get("days")}，但 data/ 裡有 {n} 個 dayN.json')
for i, d in enumerate(days, 1):
    if d.get('day') != i:
        err(f'{day_files[i-1]} 的 day 欄位是 {d.get("day")}，應該是 {i}')
if days and config.get('tripStartDate') != days[0].get('isoDate'):
    err(f'tripStartDate（{config.get("tripStartDate")}）和第 1 天的 isoDate（{days[0].get("isoDate")}）不一樣')
if days and config.get('tripEndDate') != days[-1].get('isoDate'):
    err(f'tripEndDate（{config.get("tripEndDate")}）和最後一天的 isoDate（{days[-1].get("isoDate")}）不一樣')

# ── 行程 ──────────────────────────────────────────────
TIME_RE = re.compile(r'^\d{1,2}:\d{2}([–-]\d{1,2}:\d{2})?$')
KNOWN_TAGS = {'步行', 'JR', '地鐵', '巴士', '京阪', '阪急', '近鐵', '南海', 'HARUKA', '✈️ 飛機', '計程車', '纜車', '嵯峨野小火車', '開車'}
TYPES = {'transport', 'sight', 'food', 'hotel', 'shopping', 'activity'}
ids, titles, descs = set(), {}, {}
for d in days:
    for it in d.get('items', []):
        iid = it.get('id')
        for k in ('id', 'time', 'title', 'type'):
            if not it.get(k):
                err(f'第 {d["day"]} 天有行程缺少 {k}：{iid or it.get("title")}')
        if iid in ids:
            err(f'行程 id 重複：{iid}')
        ids.add(iid)
        if iid and not str(iid).startswith(f'{d["day"]}-'):
            warn(f'{iid} 在第 {d["day"]} 天，但 id 不是 {d["day"]}- 開頭（可以，但容易搞混）')
        titles[iid] = it.get('title', '')
        descs[iid] = [re.sub(r'^\d+\.\s*', '', x).strip() for x in str(it.get('desc') or '').split('\n') if x.strip()]
        if it.get('time') and not TIME_RE.match(it['time']):
            warn(f'{iid} 的時間格式怪怪的：「{it["time"]}」（要像 08:00–08:15 或 20:25）')
        if it.get('type') and it['type'] not in TYPES:
            err(f'{iid} 的 type 不認得：{it["type"]}')
        for t in it.get('tags') or []:
            if t not in KNOWN_TAGS:
                warn(f'{iid} 的交通標籤「{t}」沒有專屬樣式，會用預設樣式')

# ── 手動維護檔對得上嗎 ─────────────────────────────────
for name, data in (('short-titles.json', short), ('access.json', access)):
    stale = [k for k in data if k not in ids]
    if stale:
        err(f'{name} 有不存在的行程 id：{", ".join(stale)}')
missing_short = [i for i in ids if i not in short]
if missing_short:
    warn(f'{len(missing_short)} 個行程沒有短標題（會直接顯示完整標題）：{", ".join(sorted(missing_short)[:8])}{"…" if len(missing_short) > 8 else ""}')
for i in range(1, n + 1):
    if str(i) not in themes:
        warn(f'day-themes.json 缺第 {i} 天的主題')
    if str(i) not in cities:
        warn(f'day-cities.json 缺第 {i} 天的城市')
for k in list(themes) + list(cities):
    if not k.isdigit() or not 1 <= int(k) <= n:
        err(f'day-themes／day-cities 有不存在的天數：{k}')

# ── 航班 ──────────────────────────────────────────────
for d in days:
    for it in d.get('items', []):
        if '✈️ 飛機' in (it.get('tags') or []):
            m = re.match(r'^([A-Z0-9]{2}\d+)\s', it.get('title', ''))
            if not m:
                warn(f'{it["id"]} 是航班，但標題開頭不是航班編號（例如 SL396 桃園 → 關西），航班卡會只顯示標題')
            elif m.group(1) not in flights:
                warn(f'航班 {m.group(1)} 在 flights.json 裡沒有資料（行李、餐點不會顯示）')
for k in flights:
    if not any(re.match(rf'^{re.escape(k)}\s', t) for t in titles.values()):
        warn(f'flights.json 的 {k} 在行程標題裡找不到對應航班')

# ── 有沒有把真的預約編號寫進去 ───────────────────────────
SECRET_RE = re.compile(r'(予約番号|預約番號|預約番号|預約代碼|訂單|預約 ?ID|查詢編號|認証コード|確認碼|confirmation)[\s:：]*[A-Za-z0-9][A-Za-z0-9\-_]{3,}', re.I)
for path in glob.glob('data/*.json') + ['index.html', 'README.md', 'HOW-TO.md']:
    try:
        text = open(path, encoding='utf-8').read()
    except FileNotFoundError:
        continue
    for m in SECRET_RE.finditer(text):
        err(f'{path} 疑似含有預約編號：「{m.group(0)[:6]}…」（真編號請存在 LINE 記事本，資料裡用 ●●●）')

# ── 結果 ──────────────────────────────────────────────
total = sum(len(d.get('items', [])) for d in days)
print(f'檢查了 {n} 天、{total} 個行程')
for w in warns:
    print(f'提醒：{w}')
for e in errors:
    print(f'錯誤：{e}')
if errors:
    print(f'\n有 {len(errors)} 個錯誤，請修正後再 push。')
    sys.exit(1)
print('沒有錯誤。' + (f'（{len(warns)} 個提醒）' if warns else ''))
