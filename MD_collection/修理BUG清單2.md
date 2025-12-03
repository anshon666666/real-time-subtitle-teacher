# 修理BUG清單2 — SR重啟前無聲迴圈與可加入新PDF（含清晰渲染）

## 背景
- 問題一：SR 保活重啟後，若現場仍是安靜或尚未偵測到語音，`lastSrResultTs` 沒更新，導致 8 秒安靜又判定卡住，持續重啟形成迴圈，影響轉錄啟動。
- 問題二：需要新增「加入PDF」功能按鍵，能把新簡報加入下拉清單並可切換；新簡報須自動符合播放區域尺寸與螢幕DPI，避免模糊。

## 修理目標
- 避免 SR 在未取得首筆結果前因安靜環境而反覆重啟。
- 提供「新增PDF」按鍵與動態列表切換；新PDF以高解析度（DPI-aware）渲染，貼合播放區域且清晰。

---

## 問題一：SR 重啟前無聲造成重啟迴圈

### 現象
- SR 重啟後，環境安靜時長期沒有 `onresult`，保活偵測的 `quietMs > 8000` 再次觸發重啟 → 形成密集重啟迴圈。

### 根因
- 保活邏輯僅以「無結果的時間」判定卡住，未區分「尚未開始出結果」與「已開始出結果後卡住」。

### 修改辦法（方案與步驟）
1. 首結果門檻（hasSrResultSinceStart）
   - 在 `sr.start()` 時設 `hasSrResultSinceStart = false`。
   - 任一 `sr.onresult`（interim/final）到來 → 設 `hasSrResultSinceStart = true`。
   - 保活重啟僅在 `hasSrResultSinceStart === true` 時生效，避免「尚未聽到任何聲音」就重啟。

2. 起始保護期（SR_POST_START_GRACE_MS）
   - 於 `sr.start()` 記錄 `srSessionStartTs = Date.now()`。
   - 保活僅在 `now - srSessionStartTs > SR_POST_START_GRACE_MS` 後開始評估。建議值：`5000ms`。

3. 靜音監測聯動（音量門檻）
   - 透過既有 `startSilenceMonitor()` 的 RMS/分貝判斷，若持續靜音則不觸發保活重啟，改顯示「等待語音輸入…」。
   - 一旦監測到音量超過門檻但仍無結果，才進入保活判斷（可能是真卡住）。

4. 日誌與冷卻維持
   - 保留 `MIN_SR_RESTART_INTERVAL_MS = 2000` 冷卻。
   - 新增日誌：
     - `🧰 SR保活: 尚無結果/靜音，暫不重啟（等待語音）`
     - `🧰 SR保活: 已有結果且8秒無新結果，觸發重啟`

### 擬定變更（檔案與區塊）
- 檔案：`js/presentation.js`
  - 常數：`SR_POST_START_GRACE_MS = 5000`
  - 變數：`let hasSrResultSinceStart = false; let srSessionStartTs = 0;`
  - 函式：`startSrKeepAlive()`、`sr.start()` 包裝處、`sr.onresult`、`startSilenceMonitor()`（提供靜音狀態布林值如 `isSilence`）

### 參考假碼（邏輯骨架）
```js
// 啟動 SR
function startLocalSr() {
  sr.start();
  srActive = true;
  hasSrResultSinceStart = false;
  srSessionStartTs = Date.now();
  startSrKeepAlive();
  startSilenceMonitor(deviceId);
}

// onresult 任何結果到來
sr.onresult = (e) => {
  hasSrResultSinceStart = true; // 首次結果旗標
  lastSrResultTs = Date.now();
  // ... 既有 interim/final 邏輯
};

// 保活邏輯
function startSrKeepAlive() {
  const timer = setInterval(() => {
    const now = Date.now();
    const quietMs = now - (lastSrResultTs || srSessionStartTs);
    const inGrace = (now - srSessionStartTs) < SR_POST_START_GRACE_MS;

    if (inGrace) { /* 等待首結果，不重啟 */ return; }
    if (!hasSrResultSinceStart) { /* 尚無結果，多半是靜音/未說話 */ return; }
    if (isSilence) { /* 監測到持續靜音，視為正常安靜，不重啟 */ return; }

    if (quietMs > SR_KEEPALIVE_QUIET_MS && (now - lastSrRestartTs) >= MIN_SR_RESTART_INTERVAL_MS) {
      console.log("🧰 SR保活: 已有結果且8秒無新結果，觸發重啟");
      lastSrRestartTs = now;
      sr.stop(); // 走 sr.onend → 安全重啟
    }
  }, SR_KEEPALIVE_CHECK_MS);
}
```

### 驗收標準
- 靜音環境下，SR 不再「啟動→過8秒→重啟」迴圈；而是等待語音輸入。
- 一旦實際開始說話並出現結果，若之後 8 秒無新結果才會觸發重啟。
- 冷卻至少 2 秒；日誌顯示正確分流（等待 vs. 觸發重啟）。

### 測試建議
- 啟動後保持安靜 ≥ 30 秒：不應出現反覆重啟，控制台顯示等待語音。
- 說一句話使 `onresult` 觸發；接著再保持安靜 8 秒：應觸發一次重啟（並受2秒冷卻）。
- 在滑動、重整、切換器材後重測，確保旗標與時序無誤。

---

## 問題二：新增PDF按鍵與清晰渲染（自動大小與DPI）

### 需求
- 提供「新增PDF」按鍵，使用者選擇本機 PDF 後即加入下拉清單；能用列表切換。
- 新 PDF 需自動適配顯示區域尺寸，並以 `devicePixelRatio` 做高解析渲染，避免模糊。

### 修改辦法（方案與步驟）
1. UI 變更（`teacher.html`）
   - 在 `#presentationListBlock` 內新增：
```html
<button id="addPdfBtn" class="pdf-add-btn">新增PDF</button>
<input id="addPdfInput" type="file" accept="application/pdf" style="display:none" />
```

2. 邏輯變更（`js/presentation.js`）
   - 維持既有 `pdfFiles` 陣列，加入動態項：
```js
const addPdfBtn = document.getElementById('addPdfBtn');
const addPdfInput = document.getElementById('addPdfInput');

addPdfBtn.addEventListener('click', () => addPdfInput.click());
addPdfInput.addEventListener('change', () => {
  const file = addPdfInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const newIdx = pdfFiles.length;
  pdfFiles.push(url);
  const opt = new Option(file.name, String(newIdx));
  pdfSelect.appendChild(opt);
  pdfSelect.value = String(newIdx);
  showSlide(newIdx);
});
// 可在 window.unload/reload 時機釋放 URL.createObjectURL
```

3. 清晰渲染（DPI-aware）
   - 於 `renderPage()` 中使用容器寬高擬合比例，並依 `devicePixelRatio (dpr)` 調整實際像素：
```js
const baseViewport = page.getViewport({ scale: 1 });
const containerWidth = pdfContainer.clientWidth || 800;
const containerHeight = pdfContainer.clientHeight || 600;
const scale = Math.min(containerWidth / baseViewport.width, containerHeight / baseViewport.height);
const viewport = page.getViewport({ scale });

const dpr = window.devicePixelRatio || 1;
canvas.style.width = Math.floor(viewport.width) + 'px';
canvas.style.height = Math.floor(viewport.height) + 'px';
canvas.width = Math.floor(viewport.width * dpr);
canvas.height = Math.floor(viewport.height * dpr);

const renderContext = { canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr,0,0,dpr,0,0] : null };
renderTask?.cancel?.(); // 若有前一個任務則取消
renderTask = page.render(renderContext);
await renderTask.promise;
```
   - 這樣 CSS 寬高貼合容器、畫布像素乘上 dpr，文字線條更清楚。

4. 防止重複渲染錯誤
   - 加入 `let renderTask = null; let wheelLock = false;`，任何換頁或 resize 前先取消或等待前一次 `renderTask` 完成，避免 `Cannot use the same canvas during multiple render()`。

### 受影響檔案
- `teacher.html`：新增按鍵與檔案選擇 input
- `js/presentation.js`：PDF 動態加入、列表更新、DPI-aware 渲染、渲染任務管理
- `css/style.css`：必要時追加 `.pdf-add-btn` 外觀（選擇性）

### 驗收標準
- 使用者可透過「新增PDF」選擇本機 PDF，成功加入下拉清單並能切換。
- 新增的簡報會自動填滿（等比縮放）到播放區域，且在高DPI螢幕上文字清晰不模糊。
- 頁面輪播、調整大小、滾輪換頁不再拋出 `render()` 重覆使用的錯誤。

### 測試建議
- 依序加入 1～3 份不同大小的 PDF；切換、滾輪、頁箭頭與滑桿換頁。
- 在 Full HD/4K 螢幕下檢視字型邊緣銳利程度；手動縮放瀏覽器視窗，確認畫面會重新渲染且清晰。
- 多次加入/切換與移動滑桿，觀察控制台無重覆渲染錯誤。

---

## 更新功能清單：簡報區縮小、轉錄區加大（4行顯示）

### 需求
- 在教師簡報模式下，縮小上方簡報區，增大下方辨識區域。
- 辨識區「至頂」時應能顯示：暫輸出文字＋4行已輸出文字（原為2行）。

### 修改辦法
- 調整比例（`css/style.css`）
  - `.container.presentation-mode .presentation-panel { flex: 5 1 0; }`（原為6）
  - `.container.presentation-mode .presentation-subtitle-panel { flex: 2 1 0; }`（原為1）
- 調整辨識區高度（`css/style.css`）
  - 一般：`.live-transcription-display { min-height: 120px; max-height: 240px; }`
  - 簡報模式覆寫：`.container.presentation-mode .live-transcription-display { min-height: 140px; max-height: 280px; }`

### 驗收標準
- 簡報區明顯縮小；辨識區高度增加。
- 在正常視窗高度下，能同時看到暫輸出文字與至少4行已輸出文字。

### 注意事項
- 以上為版面調整，未改動轉錄輸出邏輯；若需固定「僅顯示最近4行」可於 `appendTranscript` 增加裁剪邏輯（目前為自動滾動）。