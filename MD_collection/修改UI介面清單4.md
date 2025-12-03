# 修改UI介面清單4：轉錄區文字可讀性與邊界強化、暫存區暖色化

## 1. 目標
- 解決轉錄區文字顏色過淡（白色）導致在暖白背景下不可讀的問題。
- 明確強化區域邊界（棕色加深），使版面結構更清楚。
- 將暫存區（最新語音即時區）改為暖色系並統一邊界樣式。

## 2. 影響範圍
- 樣式檔：`css/style.css`
- 主要元素：`.live-transcription-display`, `.live-transcription-latest`, `.main-column .presentation-subtitle-panel`

## 3. 調整項目
- 轉錄區（`.live-transcription-display`）
  - 文字色：`#e0e0e0` → `#586e75`
  - 邊框：`#eadfc9` → 加深棕色 `#b07b44`
- 暫存區（`.live-transcription-latest`）
  - 背景色：`#faecd8`（暖橘）
  - 文字色：`#8a5a2b`（柔和咖）
  - 邊框：加深棕色 `#b07b44`
- 下方面板（`.main-column .presentation-subtitle-panel`）
  - 邊界：`border-top: 1px solid #eadfc9` → `#b07b44`

## 4. 驗收標準
1. 轉錄區文字在暖白背景上清晰可讀，不再偏白。
2. 區域邊界以棕色更明確，版面區塊層次提升。
3. 暫存區呈現暖色系且與整體主題一致。
4. 在 `http://localhost:8000/teacher.html` 預覽無排版或色彩衝突。

## 5. 回滾方案
若偏好較輕邊界，可將邊框色恢復至 `#eadfc9`。文字色可回退至前次設定。