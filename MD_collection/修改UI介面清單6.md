# 修改UI介面清單6：側欄去米黃、主色統一、劇院模式與比例調整

## 1. 目標
- 移除左側邊欄米黃色，改為極淺灰/白底並加入淡右側邊線，整體更清爽。
- 統一品牌主色為紫（Indigo），按鈕風格一致，錄音按鈕改為紫色（錄製中出現呼吸燈效果）。
- 為簡報加上「劇院模式」暗色容器（深灰/黑）與圓角，讓深色簡報更自然過渡。
- 調整比例，讓簡報視覺更聚焦（目標 80% 寬度或更大）。

## 2. 影響範圍
- 樣式檔：`css/style.css`
- 頁面：`teacher.html`（簡報模式）

## 3. 設計規範（沿用清單5並補充）
- Sidebar 背景：`#F8F9FA` 或 `#FFFFFF`
- Sidebar 分隔線：`#E5E7EB`
- Primary（品牌紫）：`#4F46E5`，Hover：`#4338CA`，Active：`#3730A3`
- Theater Container：`#2D3748`（深灰）或黑色，Radius 16px
- Canvas/卡片邊：`#E5E7EB`，陰影：`0 2px 8px rgba(17,24,39,0.06)`

## 4. 調整項目
1) 側邊欄
- `.video-list` 改為 `background: #F8F9FA; border-right: 1px solid #E5E7EB;`。
- 標題與清單分隔線同步使用 `#E5E7EB`。

2) 按鈕與錄音
- 統一 `.add-pdf-btn`、`.video-toggle-buttons button` 為主色紫樣式（已在清單5基礎上微調）。
- 新增 `.record-btn` 樣式：預設紫色實心；`data-variant="outline"` 為紫色外框；`data-state="recording"` 加紅色/綠色呼吸燈動畫。

3) 劇院模式容器
- `.container.presentation-mode .presentation-panel` 改為深灰背景、內邊距與圓角；承載 PDF 的白色卡片在其內更聚焦。
- 保持頁數滑桿與按鈕可讀性，與新底色協調。

4) 比例調整
- 一般模式 `.video-player, .presentation-panel` 寬度改為 80%。
- 簡報模式內 `canvas` 以 80% 寬度置中（必要時再調整）。

## 5. 驗收標準
- 左側不再顯示米黃色，與主內容區融合良好；邊線清晰不刺眼。
- 所有主要按鈕一致採用品牌紫；錄音按鈕在錄製中有呼吸燈效果。
- 簡報外層呈現劇院模式的暗色容器與圓角，深色內容過渡自然。
- 簡報視覺大小更合理（約 80% 寬或更大），整體聚焦度提升。
- `http://localhost:8010/teacher.html` 頁面預覽無排版問題。

## 6. 回滾方案
- 可將 `style.css` 中本次覆寫區塊還原至清單5的設定（白卡片主題）。
- 若偏好更亮容器，可將劇院模式改為 `#374151` 並降低陰影。