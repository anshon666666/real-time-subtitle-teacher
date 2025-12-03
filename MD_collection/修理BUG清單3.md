# 修理BUG清單3：刷新後新增PDF消失

## 問題描述
- 在教師端頁面中使用「+ 新增PDF」加入本機PDF後可正常顯示並切換。
- 但當瀏覽器重新整理（F5/Refresh）或重新開啟頁面時，先前新增的PDF項目會消失，只剩預設的兩份簡報。

## 影響範圍
- 頁面：`teacher.html`
- 邏輯：`js/presentation.js` 的 PDF清單管理與載入流程

## 成因分析（根因）
- 目前新增PDF時，使用 `URL.createObjectURL(file)` 產生臨時URL並推入 `pdfFiles`，再動態新增到 `<select id="pdfSelect">`。
- `pdfFiles` 初始值是固定的兩份內建簡報，頁面重載後會回到預設值，動態加入的項目不具持久性。
- `ObjectURL` 與頁面生命週期綁定；重載後記憶體釋放，先前產生的URL不再有效，也沒有任何本地持久化機制（IndexedDB / 伺服器端儲存）。

## 解決方案A（推薦）：使用 IndexedDB 持久化 PDF 檔案
在前端以 IndexedDB 儲存使用者加入的 PDF（Blob）與必要的中繼資料（檔名、加入時間）。頁面載入時，從 IndexedDB 讀出所有PDF，為每個Blob建立 `ObjectURL`，動態填入 `pdfFiles` 與下拉清單。

### 變更重點
1. 初始化資料庫並在載入時讀出所有已存PDF。
2. 新增PDF時，同步將 `file`（Blob）寫入 IndexedDB。
3. 每次載入頁面時，以 IndexedDB 的資料動態補齊 `pdfFiles` 與 `<select>`。
4. 在頁面關閉或切換PDF時，必要時呼叫 `URL.revokeObjectURL()` 釋放不再使用的URL。

### 參考程式片段（整合到 `js/presentation.js`）
```js
// 1) IndexedDB 初始化
let pdfDB;
function initPdfDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pdfSlidesDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { pdfDB = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

// 2) 儲存使用者加入的PDF（Blob）
function savePdfFile(file) {
  return new Promise((resolve, reject) => {
    const tx = pdfDB.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const record = { name: file.name, blob: file, addedAt: Date.now() };
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 3) 載入所有已存PDF並動態加入清單
async function loadStoredPdfs() {
  await initPdfDB();
  return new Promise((resolve, reject) => {
    const tx = pdfDB.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      for (const r of records) {
        const url = URL.createObjectURL(r.blob);
        const newIdx = pdfFiles.length;
        pdfFiles.push(url);
        const opt = new Option(r.name, String(newIdx));
        pdfSelect.appendChild(opt);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

// 4) DOM載入後：先讀DB再決定預設顯示
// document.addEventListener('DOMContentLoaded', async () => {
//   await loadStoredPdfs();
//   showSlide(0); // 保留既有流程：若已載入DB，索引會相對調整
// });

// 5) 新增PDF事件中：加入儲存步驟
addPdfInput.addEventListener('change', async () => {
  const file = addPdfInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const newIdx = pdfFiles.length;
  pdfFiles.push(url);
  const opt = new Option(file.name, String(newIdx));
  pdfSelect.appendChild(opt);
  pdfSelect.value = String(newIdx);
  showSlide(newIdx);

  // 寫入IndexedDB以便刷新後仍能載入
  try { await savePdfFile(file); } catch (e) { console.error('PDF持久化失敗:', e); }
  addPdfInput.value = '';
});

// 6) 清理：頁面卸載時釋放URL（選擇性）
window.addEventListener('beforeunload', () => {
  // 若你保存了本次建立的ObjectURL清單，可以在此迴圈 revoke
});
```

### 驗收標準
- 使用者加入1~3份本機PDF後，刷新頁面仍可在下拉清單中看到剛加入的項目。
- 點選清單可正常渲染PDF（DPI-aware維持清晰）。
- 多次加入/刷新不會出現重複渲染錯誤或清單遺失。

### 測試建議
- 依序加入不同大小的PDF並刷新頁面，確認清單完整保留。
- 在不同解析度顯示器下檢視渲染清晰度（與現有DPI-aware渲染相容）。
- 多次重載與切換頁面，觀察控制台無錯誤（含 IndexedDB 操作）。

### 注意事項
- IndexedDB有配額限制：大型PDF可能導致超額或寫入失敗，必要時提醒使用者或提供清除功能。
- `URL.createObjectURL` 建立的URL屬於記憶體資源，若要手動釋放，請在不再使用時呼叫 `URL.revokeObjectURL`。
- 也可改用 `pdfjsLib.getDocument({ data: await file.arrayBuffer() })` 直接以資料載入，省略ObjectURL；但仍建議持久化Blob於IndexedDB。

---

## 解決方案B（伺服器端儲存，若可用）
- 提供上傳API，將PDF存到後端（或 `assets/簡報/`）。
- 維護一份JSON索引（檔名與URL），頁面載入時 `fetch` 該清單以更新 `pdfFiles` 與下拉選單。
- 優點：無前端配額限制；缺點：需後端與網路。

---

## 受影響檔案
- `js/presentation.js`：新增IndexedDB存取與載入邏輯；在新增PDF事件中加入持久化呼叫。
- `teacher.html`：無需UI變更（維持現有按鈕與input）。

## 變更摘要（最小實作）
- 加入 `initPdfDB() / savePdfFile(file) / loadStoredPdfs()`。
- DOM載入時先呼叫 `loadStoredPdfs()` 再執行既有 `showSlide(0)`。
- 新增PDF時同步寫入IndexedDB。