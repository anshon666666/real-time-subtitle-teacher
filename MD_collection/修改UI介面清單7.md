# 修改UI介面清單7：全局深色模式 (Dark Mode)

## 🎯 目標
- **引入全局深色模式**：提供使用者在淺色與深色主題間切換的選項，確保在低光環境下有更舒適的閱讀體驗。
- **確保視覺一致性**：所有UI元件，包括背景、文字、按鈕、卡片、表單及圖示，都必須在兩種模式下清晰顯示，無任何視覺缺陷或難以辨識的情況。
- **可維護性與擴充性**：使用CSS變數（Custom Properties）重構顏色系統，使未來主題調整或新增主題變得簡單。

## 📂 影響範圍
- **HTML**
  - `teacher.html`：需新增深色模式切換器（Toggle Switch）的HTML結構。
- **CSS**
  - `css/style.css`：將進行大規模重構，引入CSS變數來管理所有顏色，並定義淺色與深色主題。
- **JavaScript**
  - `js/theme.js` (新檔案)：用於處理主題切換邏輯，並將使用者偏好儲存於 `localStorage`，以便在重新載入頁面時保持主題一致性。

---

## 🎨 設計規範 (Design Guideline)

### 顏色系統（CSS變數）
我們將在 `:root` 中定義一套完整的顏色變數。`body` 標籤將根據 `data-theme` 屬性（`light` 或 `dark`）來切換顏色。

#### 基礎變數 (Base Variables)
```css
:root {
  /* 主色系 (Primary - Indigo) */
  --primary-color: #4F46E5;
  --primary-hover: #4338CA;
  --primary-active: #3730A3;
  --primary-text: #FFFFFF;
  --primary-subtle-bg: #EEF2FF; /* 用於標籤背景 */

  /* 灰階 (Grayscale) */
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;

  /* 其他顏色 */
  --white: #FFFFFF;
  --black: #000000;
  --danger-color: #EF4444; /* 紅色，用於錄音中 */
  --success-color: #22C55E; /* 綠色，備用 */
}
```

#### 主題變數 (Theme Variables)
這些變數將根據主題切換，對應到上方的基礎變數。

```css
/* 淺色模式 (預設) */
body[data-theme='light'] {
  --global-bg: var(--gray-100); /* #F3F4F6 */
  --sidebar-bg: var(--gray-50); /* #F9FAFB */
  --card-bg: var(--white);
  --text-primary: var(--gray-800); /* 主要文字 */
  --text-secondary: var(--gray-500); /* 次要文字 */
  --border-color: var(--gray-200);
  --border-color-heavy: var(--gray-300);
  --shadow-color: rgba(17, 24, 39, 0.08);
  --theater-bg: var(--gray-800); /* 劇院模式容器背景 */
}

/* 深色模式 */
body[data-theme='dark'] {
  --global-bg: var(--gray-900); /* #111827 */
  --sidebar-bg: var(--gray-800); /* #1F2937 */
  --card-bg: var(--gray-800);
  --text-primary: var(--gray-200); /* 主要文字 */
  --text-secondary: var(--gray-400); /* 次要文字 */
  --border-color: var(--gray-700);
  --border-color-heavy: var(--gray-600);
  --shadow-color: rgba(0, 0, 0, 0.2);
  --theater-bg: var(--black); /* 劇院模式容器背景 */
}
```

---

## 🛠️ 調整項目 (Adjustment Items)

1.  **建立 `theme.js`**
    - 建立新檔案 `js/theme.js`。
    - 編寫邏輯：
      - 監聽切換器點擊事件。
      - 根據目前主題切換 `body` 的 `data-theme` 屬性 (`light` / `dark`)。
      - 將選擇的主題儲存到 `localStorage.setItem('theme', 'dark')`。
      - 頁面載入時，從 `localStorage.getItem('theme')` 讀取偏好並套用。若無偏好，可預設為淺色。

2.  **修改 `teacher.html`**
    - 在側邊欄 (`.video-list`) 底部或頂部新增一個切換器 (Toggle Switch)。
    - 引入 `js/theme.js`。

3.  **重構 `css/style.css`**
    - 在檔案開頭定義 `:root` 顏色變數與 `body[data-theme='light']`, `body[data-theme='dark']` 主題變數。
    - **全局替換**：將現有的硬編碼顏色值（如 `#FFFFFF`, `#F8F9FA`, `#4F46E5` 等）替換為對應的CSS變數（如 `var(--card-bg)`, `var(--sidebar-bg)`, `var(--primary-color)`)。
    - **影響範圍包括**：
      - `body`, `.container` (`background-color` -> `var(--global-bg)`)
      - `.video-list` (`background-color` -> `var(--sidebar-bg)`, `border-right` -> `var(--border-color)`)
      - `.presentation-content`, `.pdf-container canvas`, `.live-transcription-display` 等卡片樣式 (`background-color` -> `var(--card-bg)`, `box-shadow` -> `var(--shadow-color)`)
      - 所有文字顏色 (`color` -> `var(--text-primary)` 或 `var(--text-secondary)`)
      - 所有邊框顏色 (`border`, `border-bottom` -> `var(--border-color)`)
      - 按鈕 (`.add-pdf-btn`, `.record-btn` 等) 的背景與文字顏色。
      - 表單控制項 (`select`, `input`) 的樣式。
      - `.theater-container` 的背景 (`background-color` -> `var(--theater-bg)`)。

4.  **逐一元件檢視與微調**
    - 在深色模式下，特別檢查以下元件的視覺效果：
      - **時間標籤 (`.time-tag`)**：背景與文字顏色需重新搭配，確保清晰。
      - **PDF換頁滑桿 (`.page-slider`)**：軌道與滑塊顏色需調整。
      - **下拉選單 (`.pdf-select`, `.mic-select`)**：深色模式下的原生樣式可能不佳，需客製化。
      - **陰影 (`box-shadow`)**：深色模式下的陰影需更柔和或使用不同顏色。

---

## ✅ 驗收標準 (Acceptance Criteria)

1.  **功能正常**：
    - ✅ 頁面中存在一個可點擊的深淺色模式切換器。
    - ✅ 點擊切換器後，主題立即在淺色與深色間切換，無延遲或閃爍。
    - ✅ 重新整理頁面後，應保持上次選擇的主題。

2.  **視覺完整性**：
    - ✅ **無白色殘影**：深色模式下，所有背景（全局、側欄、卡片）均應變為深色，不應有任何刺眼的白色區塊殘留。
    - ✅ **文字清晰**：所有文字在兩種模式下均有足夠的對比度，易於閱讀。
    - ✅ **按鈕與互動元件**：所有按鈕、輸入框、下拉選單在兩種模式下都清晰可見，其 `hover`, `active`, `focus` 狀態效果正常。
    - ✅ **邊框與分隔線**：所有分隔線在深色模式下應為淺灰色，在淺色模式下為深灰色，清晰但不過於突兀。
    - ✅ **圖示與圖片**：若有圖示，需確保在深色背景下依然可見（例如，從深色圖示變為淺色圖示）。

3.  **程式碼品質**：
    - ✅ `css/style.css` 中，所有顏色值均已由CSS變數取代。
    - ✅ `js/theme.js` 程式碼簡潔、有效，並有適當註解。

---

## ⏪ 回滾計畫 (Rollback Plan)
若出現嚴重問題，可依以下步驟回滾：
1.  從 `teacher.html` 中移除對 `js/theme.js` 的引用及切換器的HTML。
2.  捨棄 `js/theme.js` 檔案。
3.  使用版本控制（如 Git）還原 `css/style.css` 至修改前的版本，移除所有CSS變數。