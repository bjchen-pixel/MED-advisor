# MED-advisor｜機械設計小幫手

把散在標準表、供應商目錄與內規裡的數字整理成查得到的工具集。
目前收錄第一個工具：

## 螺絲孔設計建議工具 v1

沉頭孔深度與螺絲長度的查表工具。把散在標準表、供應商目錄與內規裡的數字整理成一份表，
加上幾條四則運算，讓工程師不用翻手冊。

**這個工具不做判斷。** 它攤開判準（`E/d`、餘隙、殘留肉厚）與每個數字的來源，
判斷留給工程師——自動選一個值會讓工具變橡皮章。

---

## ⚠ 目前狀態：資料尚未查證

隨附的五張資料表，數值全部來自派工單附錄的**記憶參考值**，尚未逐值查證，
一律標為 `verified: "unverified"`。

工具會在畫面上大聲說這件事——警示帶會列出所有未查證的欄位，候選列展開層逐值顯示標記。
**查證完成前請勿直接採用輸出結果。** 查證程序見計畫書 §4。

---

## 快速開始

```bash
npm install
npm run dev          # 開發伺服器
npm run test         # 測試（含資料表 schema 驗證）
npm run coverage     # 覆蓋率
npm run lint         # 含「計算核心不得碰 DOM」的檢查
```

## 甲方需手動完成的步驟

以下兩項由 repo 擁有者在 GitHub 網頁上確認（`gh` 可代做第 1 項，見下）：

1. **Settings → Pages → Build and deployment → Source 選「GitHub Actions」**
   不要選「Deploy from a branch」，本專案用 Actions 部署。

2. **Settings → Actions → General → Workflow permissions**
   確認允許 workflow 讀取內容並寫入 Pages。
   （`deploy.yml` 已宣告 `permissions`，但組織層級設定可能覆蓋它。）

推送到 `main` 後 Actions 會自動建置並部署。

## 推送前的本地驗證

`base` 設錯在 dev server 上**完全看不出來**，只會在 Pages 上白屏。
而且一般的 `npm run build` 在本地 `base` 是 `/`，**測不到 Pages 那條路徑**。
所以要用這個：

```bash
npm run verify:pages
```

然後開 <http://localhost:4173/MED-advisor/> 逐項確認：

- [ ] DevTools → Network **零 404**（尤其 JS / CSS）
- [ ] 頁面確實渲染出輸入欄位，不是空白
- [ ] 選好墊圈後出現候選清單
- [ ] 改一次板厚，剖面圖跟著重繪（確認 JS 真的在跑，不只是 HTML 載入）

> **Windows / Git Bash 注意**：`BASE_PATH` 刻意不帶斜線。MSYS 會把以 `/` 開頭的
> 環境變數值當成 Unix 路徑轉換，`BASE_PATH=/MED-advisor/` 會變成
> `/Program Files/Git/MED-advisor/`，建置出來的資源路徑全錯。
> `vite.config.ts` 的 `normalizeBase()` 會處理這件事。

## 廠內牙深規範（overlay）

`H_eff`（有效牙深）取決於絲攻型式、盲孔通孔與底孔餘量，是全案唯一的非公開資料。

- 公開 repo 只放**保守預設值**：`src/data/thread-depth.default.json`
- 廠內規範放 `src/data/thread-depth.internal.json`（已被 `.gitignore` 排除）
- 範例骨架：`src/data/thread-depth.internal.example.json`

**overlay 是整表取代，不做逐列合併。** 你的檔案必須涵蓋預設表的完整鍵集
（M3/M4/M5/M6/M8 × blind），缺一格就會全頁阻斷、不會回退到預設值——
逐列合併會產生一張沒有任何人寫過的混合表，而畫面只能顯示一個來源，顯示哪個都在說謊。

未放 overlay 時，畫面會持續顯示 `default（保守預設值）` 並發出警示。
嫌吵的正確解法是放內規檔，不是調低警示等級。

## 實機孔位回歸測試

甲方用 Excel 填 `tests/fixtures/regression.csv`（一列一個孔），然後：

```bash
npm run fixtures:import   # CSV → tests/fixtures/regression.json
npm run test
```

**期望值欄位全部選填，留空＝不檢查**——你知道板厚、螺絲、墊圈、材質，
知道現場實際用了哪個長度，不需要算出 `E`。

但有兩條**預設斷言**，不需你填任何數字：

| 實際使用結果 | 工具必須 |
|---|---|
| `正常` | 不得判整組不可行；你填的長度須落在「建議」或「偏淺」 |
| `出過問題` | 必須判「會頂底／不可行」，或至少發出一筆警示 |
| `不確定` | 不套預設斷言 |

`狀態` 欄控制嚴格度：`待確認` 失敗只印報告不擋 CI，`已確認` 失敗即紅燈。

先用 `待確認` 丟進來看工具怎麼判，再決定是工具錯還是那個孔本來就有問題，
判定完才升級成 `已確認`。現場沒問題 ≠ 設計正確——一個孔可能 `E` 略低於 `k_min`
卻因負載不高而長年無事。

## 專案結構

```
src/core/     計算核心。純函式，不碰 DOM / fetch / 環境變數 / bundler API
              （由 eslint 規則與 tests/data/schema.test.ts 雙重把關）
src/data/     zod schema、五張資料表、載入器。overlay 探測住在這一層
src/ui/       手寫元件，無元件庫。五個區塊垂直排列，順序固定
tests/        核心測試、資料表驗證、實機孔位回歸
scripts/      CSV → JSON 轉檔
```

計算核心設計成可複用，是為了之後的批次收斂頁與 CAD add-in——
散進 UI 事件處理就會長出不一致的第二份。

## v1 不包含

全機長度收斂、公差配合頁、錐頭／圓頭（FHCS/BHCS）、通孔攻牙、CAD add-in、
PWA 離線快取、登入權限、壓入力與接觸壓力計算、軸承配合、熱膨脹與硬陽極對配合的影響。

排除理由是控制範圍，不是判定為不重要。詳見派工單 §6。
