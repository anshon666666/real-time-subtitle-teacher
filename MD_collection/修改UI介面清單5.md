# 修改UI介面清單5：淺色模式現代化重構（Light Mode Redesign）

## 1. 目標
- 放棄舊米黃色主題，導入冷灰/陶瓷白為全局背景，建立一致、乾淨的淺色設計。
- 以卡片式（Card-based）層次呈現主要內容區，搭配柔和陰影與適度圓角。
- 選擇「教育/科技」感的靜謐藍/藍紫作為主色，用於按鈕與重點元素。
- 底部轉錄區改為聊天/字幕流的卡片樣式，時間標籤採 Pill 造型、提升資訊的輕盈感。

## 2. 影響範圍
- 樣式檔：`css/style.css`
- 頁面：`teacher.html`（簡報模式與一般模式）

## 3. Style Guide
- Global Background：`#F4F6F8`（Off-White/Cool Gray）
- Surface / Cards：`#FFFFFF`，陰影 `0 2px 8px rgba(17,24,39,0.06)`
- Border：`#E3E8EF`、分隔線 `#E5E7EB`
- Text Primary：`#1F2937`，Text Secondary：`#4B5563`
- Primary（教育藍/藍紫）：`#4F46E5`；Tint：`#EEF2FF`
- Radius：8–12px
- Line-height：1.6（轉錄文本）
- Font-family：`Inter, Roboto, Noto Sans TC, system-ui, -apple-system, sans-serif`

## 4. 調整項目
1) 全局與字體
- `body` 改為背景 `#F4F6F8`，字體統一為現代無襯線（見上）。

2) 側邊欄與清單
- `.video-list` 改為白底 `#FFFFFF`、`border-right: 1px solid #E3E8EF`。
- `.video-list h3` 與列表分隔線改為 `#E3E8EF`，hover 使用 `#F4F6F8`。
- `.pdf-select` 改為白底、灰邊、深色文字，提升可讀性。

3) 按鈕與主色
- 統一按鈕外觀（圓角 10px、陰影、主色 `#4F46E5`），hover 深色 `#4338CA`。
- `.add-pdf-btn`、`.video-toggle-buttons button`、`.page-arrow` 採用主色系。

4) 內容卡片
- `.presentation-panel` 與 `.pdf-container` 採白色卡片、柔和陰影與圓角。
- `canvas` 邊框 `#E3E8EF`、圓角 12px。

5) 底部轉錄區
- `.main-column .presentation-subtitle-panel` 底色改為 `#F4F6F8`、頂部細邊線 `#E3E8EF`。
- `.live-transcription-display`、`.live-transcription-latest` 改為白卡片、淡灰邊與柔和陰影；字色 `#1F2937`。
- `.time-tag` 改為 Pill 形：底 `#EEF2FF`、字 `#4F46E5`、移除重邊框。

## 5. 驗收標準
- 頁面不再出現米黃色背景；整體色系一致、乾淨。
- 側邊欄白底且與主內容區有清晰分隔線。
- 轉錄區呈卡片樣式、時間標籤為 Pill、行距為 1.6，沒有黑色粗邊框。
- 按鈕皆採主色藍紫並具柔和陰影與圓角。
- 在 `http://localhost:8010/teacher.html` 預覽可正常顯示，無跑版、字距/行距不協調問題。

## 6. 回滾方案
- 可將 `css/style.css` 中新增或覆寫的區塊註解或還原至清單4的設定。
- 若使用者偏好暖色主題，可恢復 Solarized Light 色票與相關邊框設定。