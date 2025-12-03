# 修改UI介面清單1：整體暖色系調整

## 1. 目標
將現有的深色系介面調整為更柔和、更美觀的暖色系，提升長時間使用的舒適度與視覺質感。

## 2. 影響範圍
- **主要頁面**：`teacher.html`
- **樣式檔案**：`css/style.css`

## 3. 暖色系色彩定義
- **背景色 (暖白)**：`#fdf6e3` (Solarized Light)
- **主文字顏色 (深灰)**：`#586e75`
- **容器與邊框 (淺灰)**：`#eee8d5`
- **強調色 (暖橙)**：`#cb4b16`
- **按鈕與連結 (藍)**：`#268bd2`
- **成功/提示 (綠)**：`#859900`
- **警告/注意 (黃)**：`#b58900`

## 4. CSS 變更計畫
- **`body`**：
  - `background-color`: `#333` → `#fdf6e3`
  - `color`: `white` → `#586e75`
- **`.container`, `.card` 等容器**：
  - `background-color`: `#444` → `#eee8d5`
  - `border-color`: `#555` → `#ddd`
- **`.live-transcription-display`, `.live-transcription-latest`**：
  - `background-color`: `#222` → `#fdf6e3`
  - `border-color`: `#555` → `#eee8d5`
- **`button`, `select`**：
  - `background-color`: `#555` → `#268bd2`
  - `color`: `white` → `white`
  - `border`: `1px solid #777` → `1px solid #1a6a9e`
- **`.time-tag`**：
  - `color`: `#ccc` → `#93a1a1`
- **警告訊息 (如 `遠端未回應`)**：
  - `color`: `orange` → `#b58900`

## 5. 驗收標準
1. 開啟 `teacher.html` 頁面，背景色應為暖白色。
2. 所有文字顏色應清晰可讀，主要為深灰色。
3. 轉錄區塊、按鈕、下拉選單等元件的顏色應符合新的暖色系定義。
4. 整體視覺風格和諧、美觀，無刺眼或難以辨識的顏色組合。

## 6. 風險與回滾
- **風險**：部分元素的顏色可能未被覆蓋到，導致新舊色系混雜。
- **回滾**：若效果不佳，可透過版本控制（如 Git）還原 `css/style.css` 的變更。