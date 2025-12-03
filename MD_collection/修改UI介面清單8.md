# 修改UI介面清單8：修復深色模式與PDF縮放問題

## 🎯 目標
- **修復深色模式顯示不一致**：確保「即時轉錄」區域在深色模式下，背景能正確切換為深色，與整體主題保持一致。
- **解決PDF縮放錯誤**：修復在調整瀏覽器視窗大小後，PDF內容無法正確重新縮放以適應容器的問題，確保在任何視窗尺寸下都有最佳的閱讀體驗。

## 📂 影響範圍
- **CSS**
  - `css/style.css`：需要修正或覆蓋造成轉錄區塊背景錯誤的樣式選擇器。
- **JavaScript**
  - `js/presentation.js`：將新增視窗大小變動的事件監聽器，以便在容器尺寸改變時，能動態重新渲染PDF。

---

## 🐞 問題分析與修復計畫

### 問題一：轉錄區域在深色模式下未變色

- **問題分析**：
  經過檢查，雖然我們已經為多數容器設定了深色模式的變數，但有一個更具體的CSS選擇器 `div.presentation-content` 仍然保有寫死的白色背景 (`background-color: #FFFFFF`)。這個選擇器的優先級（Specificity）高於我們之前設定的通用樣式，導致深色模式的背景顏色 `var(--card-bg)` 無法被正確套用。

- **修復計畫**：
  1.  **修改 `css/style.css`**：
      -   找到 `div.presentation-content` 這個選擇器。
      -   將其 `background-color` 從 `#FFFFFF` 修改為 `var(--card-bg)`。
      -   同時，將其 `color` 也修改為 `var(--text-primary)`，確保文字顏色在兩種模式下都清晰可見。
      -   為求動畫流暢，會一併加上 `transition` 效果。

### 問題二：調整視窗後PDF大小顯示異常

- **問題分析**：
  目前的PDF渲染邏輯僅在載入檔案或切換頁面時執行一次。當瀏覽器視窗大小被調整時，`#pdfContainer` 的尺寸雖然改變了，但內部的 `<canvas>` 元素並未被通知需要重新繪製。這導致 `canvas` 仍然保持著舊的尺寸，造成顯示比例錯誤或內容被裁切。

- **修復計畫**：
  1.  **修改 `js/presentation.js`**：
      -   在檔案中新增一個 `debounce` 函式。這是一個常見的優化技巧，可以防止事件（如 `resize`）在短時間內被過於頻繁地觸發，確保只在使用者停止調整視窗大小後才執行渲染，避免效能浪費。
      -   新增一個 `handleResize` 函式。此函式的作用是重新呼叫 `renderPage` 來繪製當前的PDF頁面，`renderPage` 會自動根據容器的新尺寸計算出最佳的縮放比例。
      -   在 `DOMContentLoaded` 事件監聽器的最下方，綁定一個 `resize` 事件到 `window` 物件上，並將 `debounce(handleResize, 250)` 作為回呼函式。這表示當視窗大小改變時，程式會等待250毫秒，若無新的 `resize` 事件，則執行 `handleResize`。

---

## ✅ 驗收標準

1.  **深色模式驗收**：
    - ✅ 開啟深色模式後，即時轉錄區域的背景應變為深灰色 (`var(--gray-800)`)，與側邊欄背景一致。
    - ✅ 轉錄區域內的文字應變為淺灰色 (`var(--gray-200)`)，確保清晰可讀。

2.  **PDF縮放驗收**：
    - ✅ 載入PDF後，拖曳改變瀏覽器視窗的寬度或高度。
    - ✅ 放開滑鼠後，PDF應會自動重新縮放，完整地顯示在容器內，不會被裁切或留下過多空白。
    - ✅ 反覆縮放視窗，功能依然正常。

---

## ⏪ 回滾計畫
若出現嚴重問題，可依以下步驟回滾：
1.  **CSS回滾**：使用版本控制（如 Git）還原 `css/style.css` 中對 `div.presentation-content` 的修改。
2.  **JavaScript回滾**：移除 `js/presentation.js` 中新增的 `debounce` 函式、`handleResize` 函式以及 `window.addEventListener('resize', ...)` 的程式碼。