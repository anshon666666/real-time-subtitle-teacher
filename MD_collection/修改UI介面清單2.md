# 修改UI介面清單2：修正PDF跑版與轉錄區暖色化

## 1. 目標
- 修正簡報模式中 PDF 顯示跑版問題（canvas 不應使用絕對定位）。
- 將下方轉錄區（presentation-subtitle-panel 與內容）改為一致的暖色系，提升閱讀舒適度。

## 2. 影響範圍
- `css/style.css`
- 受影響頁面：`teacher.html`（簡報模式與一般模式的顯示）

## 3. 修改重點
1) PDF顯示修正
- 將 `.video-wrapper video, .pdf-container canvas { ... }` 改為僅套用在 `video`，移除對 `canvas` 的絕對定位。
- 保持 `.pdf-container` 為置中彈性盒，回復 `canvas` 為 `display: block; height: auto;`，避免拉伸與覆蓋。
- 將 `.pdf-container canvas` 邊框改為暖灰色 `#eee8d5`。

2) 下方轉錄區暖色化
- 調整 `.main-column .presentation-subtitle-panel` 背景為淺暖灰 `#eee8d5`，文字為深灰 `#586e75`。
- 轉錄內容區仍保持 `.live-transcription-display` 與 `.live-transcription-latest` 的暖色系設定。

## 4. 驗收標準
- 進入簡報模式，PDF正常置中顯示，不會蓋住其他元素或被拉伸。
- 下方轉錄區整體背景為暖色，文字可讀性佳。
- 在 `http://localhost:8000/teacher.html` 頁面預覽無任何跑版或色彩不一致情況。

## 5. 風險與回滾
- 若其他頁面依賴 `canvas` 的絕對定位，可能受影響；目前專題中未見此依賴。
- 可透過版本管理還原 `css/style.css` 的改動或回退至清單1設定。