# 修改UI介面清單9：調整簡報與字幕區域比例

## 1. 目標
調整簡報區域與下方即時轉錄字幕區域的大小比例，確保字幕區域的高度足以顯示至少三行文字，提升閱讀體驗。

## 2. 影響範圍
- **樣式檔**：`css/style.css`
- **頁面**：`teacher.html`（簡報模式下）

## 3. 調整項目
### CSS 調整 (`css/style.css`)
目前簡報模式下的垂直比例為 `5:2`（簡報區 5 : 字幕區 2），導致字幕區在部分螢幕高度下過小。將調整為 `5:3` 或更適合的比例，以增加下方空間。

1.  **調整 Flex 比例**
    -   `.container.presentation-mode .presentation-panel`：
        -   原設定：`flex: 5 1 0;`
        -   新設定：`flex: 5 1 0;` (保持或微調，配合下方比例)
    -   `.container.presentation-mode .presentation-subtitle-panel`：
        -   原設定：`flex: 2 1 0;`
        -   新設定：`flex: 3 1 0;`
    -   說明：將比例從 `5:2` (約 71% : 29%) 調整為 `5:3` (約 62.5% : 37.5%)，為下方字幕區爭取更多垂直空間。

2.  **確保字幕區最小高度**
    -   檢查 `.live-transcription-display` 的 `min-height` 設定。
    -   目前已設為 `140px`，足以容納 3 行文字（每行約 1.6em）。
    -   透過增加父容器 (`.presentation-subtitle-panel`) 的 Flex 佔比，確保該區域能展開至足夠高度，而不被擠壓。

## 4. 驗收標準
1.  在簡報模式下，下方字幕區域明顯變高。
2.  字幕顯示區 (`.live-transcription-display`) 在不需捲動的情況下，能完整顯示至少三行文字。
3.  簡報區域 (`.presentation-panel`) 仍然保有足夠的展示空間，不會過度壓縮。
4.  在 `http://localhost:8010/teacher.html` 預覽無排版異常。

## 5. 回滾方案
若調整後簡報區域過小影響觀看，可將 Flex 比例還原回 `5:2`。
