# 網頁佈局修改計畫

## 1. 佈局更動 (HTML & CSS)

- **主要結構**: 將頁面分為左右兩大部分。
    - **左側 (控制面板)**: 寬度約 30%，背景色為深灰色。
    - **右側 (簡報顯示)**: 寬度約 70%。

- **左側內容調整**:
    1. **簡報清單**: 
        - 新增 `<h2>` 標題 "簡報清單"。
        - "選擇簡報" 下拉選單。
        - "新增PDF" 按鈕，紫色背景。
    2. **語音設定**:
        - "本地語音錄製" 分隔線或標題。
        - "深色模式" 開關。
        - 聲音來源選擇下拉選單。
        - "開始錄音" 按鈕。
    3. **字幕區域**:
        - 保持在左側下方。

- **右側內容**:
    - 移除現有的字幕顯示區。
    - 僅保留 PDF 簡報的顯示區塊。

## 2. 字幕自動滾動功能 (JavaScript)

- **目標**: 字幕區塊能自動滾動到最新的字幕。
- **實作方式**:
    - 在 `js/subtitles.js` 中，找到新增字幕的函式。
    - 每次新增字幕後，計算字幕容器的總高度。
    - 將容器的 `scrollTop` 屬性設置為其 `scrollHeight`，這樣捲軸就會自動滾到最下方。

    ```javascript
    // 範例程式碼
    const subtitlesContainer = document.getElementById("subtitles-container");
    
    function addSubtitle(text) {
        // ... (現有的新增字幕邏輯)
        
        // 自動滾動到底部
        subtitlesContainer.scrollTop = subtitlesContainer.scrollHeight;
    }
    ```

## 3. 實作步驟

1.  **HTML (`teacher.html`)**: 
    - 建立 `div` 將頁面分為 `class="left-panel"` 和 `class="right-panel"`。
    - 將相關的控制元件（按鈕、選單等）移至 `left-panel`。
    - 將 PDF 顯示區移至 `right-panel`。

2.  **CSS (`css/style.css`)**:
    - 新增 `left-panel` 和 `right-panel` 的樣式，設定寬度、背景色等。
    - 微調控制元件的樣式以符合參考圖片。

3.  **JavaScript (`js/subtitles.js`)**:
