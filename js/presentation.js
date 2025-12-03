// presentation.js
// 使用 PDF.js 渲染簡報，支援下拉選單切換與滑鼠滾輪換頁

// ===== IndexedDB PDF 持久化功能 =====
let pdfDB;

// 初始化 IndexedDB
function initPdfDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pdfSlidesDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { 
      pdfDB = req.result; 
      resolve(); 
    };
    req.onerror = () => reject(req.error);
  });
}

// 儲存使用者加入的PDF（Blob）
function savePdfFile(file) {
  return new Promise((resolve, reject) => {
    if (!pdfDB) {
      reject(new Error('Database not initialized'));
      return;
    }
    const tx = pdfDB.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const record = { name: file.name, blob: file, addedAt: Date.now() };
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 載入所有已存PDF並動態加入清單（改為以參數傳遞，避免作用域錯誤）
function loadStoredPdfs(pdfFilesRef, pdfSelectEl) {
  return new Promise((resolve, reject) => {
    if (!pdfDB) {
      resolve(); // 如果DB未初始化，直接返回
      return;
    }
    const tx = pdfDB.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const req = store.getAll();
    req.onsuccess = () => {
      try {
        const records = req.result || [];
        for (const r of records) {
          const url = URL.createObjectURL(r.blob);
          const newIdx = pdfFilesRef.length;
          pdfFilesRef.push(url);
          const opt = new Option(r.name, String(newIdx));
          if (pdfSelectEl) pdfSelectEl.appendChild(opt);
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const pdfSelect = document.getElementById("pdfSelect");
  const pdfContainer = document.getElementById("pdfContainer");
  const pageSlider = document.getElementById("pageSlider");
const pageArrowUp = document.getElementById("pageArrowUp");
const pageArrowDown = document.getElementById("pageArrowDown");

// ===== 語音轉錄控制 =====
const recordBtn = document.getElementById("recordBtn");
const micSelect = document.getElementById("micSelect");
const sttIframe = document.getElementById("sttIframe");
let sttReady = false;
let isRecording = false;
let devicesLoaded = false;
let lastSttMessageTs = 0;
let sr; // 本地語音辨識實例
let srActive = false; // 本地辨識是否啟用
let srGuardTimer = null; // 本地辨識安全重啟計時器
// 控制是否使用遠端 STT（iframe / API）。預設關閉，改用本地為主。
const USE_REMOTE_STT = true;
// 控制是否啟用本地語音辨識備援（在遠端為主時才有意義；預設關閉）
const USE_LOCAL_SR_BACKUP = false;
let lastSrResultTs = 0;
let lastSrRestartTs = 0; // SR重啟時間戳，用於冷卻機制
let srKeepAliveTimer = null;
let hasSrResultSinceStart = false; // 首結果門檻：本輪是否已產生任一結果
let srSessionStartTs = 0; // SR會話開始時間戳
const SR_KEEPALIVE_QUIET_MS = 8000; // 若 8s 無結果則認定卡住
const SR_KEEPALIVE_CHECK_MS = 1000;  // 每 1s 檢查一次
const MIN_SR_RESTART_INTERVAL_MS = 2000; // SR重啟冷卻時間
const SR_POST_START_GRACE_MS = 5000; // 起始保護期：啟動後5秒內不觸發重啟
// 遠端開錄回退：若遠端未在時限內回應，啟用本地辨識
let remoteStartTimer = null;
// 自動重啟機制：2秒內無語音或辨識停止時自動重啟
let autoRestartTimer = null;
const AUTO_RESTART_DELAY_MS = 2000; // 2秒後自動重啟
let lastActivityTime = 0; // 最後活動時間
const REMOTE_START_TIMEOUT_MS = 3000;
const REMOTE_STRICT_MODE = false;
const STT_ORIGIN = (function(){
  try { return new URL(sttIframe?.src || "https://avatarai.tplinkdns.com:9000/").origin; }
  catch { return "https://avatarai.tplinkdns.com:9000"; }
})();

function updateRemoteStatus(text) {
  const el = document.getElementById("remoteSttStatus");
  if (el) el.textContent = text || "";
}

  const pdfFiles = [
    "assets/簡報/模擬實驗架構(聽障生)-更.pdf",
    "assets/簡報/0818實驗情形講解.pdf"
  ];

  // 設定 PDF.js worker
  if (window['pdfjsLib']) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  let currentIdx = 0;
  let pdfDoc = null;
  let currentPage = 1;
  let wheelLock = false; // 防抖，避免一次滾動跳多頁
  let canvas = null;
  let ctx = null;
  let renderTask = null; // 防止重複渲染錯誤

  // 新增PDF功能
  const addPdfBtn = document.getElementById("addPdfBtn");
  const pdfFileInput = document.getElementById("pdfFileInput");
  
  if (addPdfBtn && pdfFileInput) {
    addPdfBtn.addEventListener("click", () => {
      pdfFileInput.click();
    });
    
    pdfFileInput.addEventListener("change", async () => {
      const file = pdfFileInput.files?.[0];
      if (!file) return;
      
      const url = URL.createObjectURL(file);
      const newIdx = pdfFiles.length;
      pdfFiles.push(url);
      
      // 新增選項到下拉清單
      const opt = document.createElement("option");
      opt.value = String(newIdx);
      opt.textContent = file.name;
      pdfSelect.appendChild(opt);
      
      // 自動切換到新PDF
      pdfSelect.value = String(newIdx);
      showSlide(newIdx);
      
      // 寫入IndexedDB以便刷新後仍能載入
      try {
        await savePdfFile(file);
        console.log('PDF已成功儲存到IndexedDB:', file.name);
      } catch (error) {
        console.error('PDF持久化失敗:', error);
      }
      
      // 清空檔案選擇器
      pdfFileInput.value = "";
    });
  }

  function syncSlider() {
    if (!pageSlider) return;
    if (!pdfDoc) {
      pageSlider.disabled = true;
      pageSlider.min = "1";
      pageSlider.max = "1";
      pageSlider.step = "1";
      pageSlider.value = "1";
      return;
    }
    pageSlider.disabled = false;
    pageSlider.min = "1";
    pageSlider.max = String(pdfDoc.numPages);
    pageSlider.step = "1";
    pageSlider.value = String(currentPage);
  }

  // ===== 語音轉錄：麥克風與錄音控制 =====
  async function ensureMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 立即停止以釋放資源，只是為了取得裝置標籤
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (err) {
      console.error("麥克風權限被拒絕或不可用", err);
      return false;
    }
  }

  // 嘗試捕獲系統音頻（包含影片聲音）
  async function captureSystemAudio() {
    try {
      // 嘗試使用 getDisplayMedia 捕獲系統音頻
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            systemAudio: "include" // 包含系統音頻
          }
        });
        return stream;
      }
    } catch (err) {
      console.warn("無法捕獲系統音頻:", err);
    }
    return null;
  }

  let loadMicDebounceTimer = null;
const debouncedLoadMicDevices = () => {
  clearTimeout(loadMicDebounceTimer);
  loadMicDebounceTimer = setTimeout(loadMicDevices, 500); // 500ms 防抖
};

let micLabelsUnlocked = false;
let lastMicDeviceIds = [];
async function loadMicDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let mics = devices.filter(d => d.kind === "audioinput");
    // 如果所有 label 都是空的，嘗試解鎖一次標籤
    const allLabelsEmpty = mics.length > 0 && mics.every(d => !d.label);
    if (allLabelsEmpty && !micLabelsUnlocked && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        micLabelsUnlocked = true;
        devices = await navigator.mediaDevices.enumerateDevices();
        mics = devices.filter(d => d.kind === "audioinput");
      } catch (e) {
        // 無法解鎖就維持匿名標籤
      }
    }

    // 僅在裝置清單有變更時才更新選單
    const ids = mics.map(d => d.deviceId || "");
    const changed = ids.length !== lastMicDeviceIds.length || ids.some((id, i) => id !== lastMicDeviceIds[i]);

    if (changed) {
      micSelect.innerHTML = "";
      if (mics.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "未偵測到麥克風";
        opt.value = "";
        micSelect.appendChild(opt);
        micSelect.disabled = true;
      } else {
        mics.forEach((d, idx) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId || "";
          opt.textContent = d.label || `麥克風 ${idx + 1}`;
          micSelect.appendChild(opt);
        });
        micSelect.disabled = false;
      }
      lastMicDeviceIds = ids;
    }
    devicesLoaded = true;
  } catch (err) {
    console.error("列舉麥克風失敗", err);
  }
}

  function formatTimeRange(startSec, endSec) {
  const fmt = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    } else {
      return `${m}:${String(s).padStart(2, "0")}`;
    }
  };
  return `${fmt(startSec)} - ${fmt(endSec)}`;
}

let recordingStartTs = 0;
let lastPhraseEndSec = 0;
let interimBuffer = "";
let interimLastCommitMs = 0;
let lastCommittedText = "";
let lastCommittedNorm = "";
const INTERIM_COMMIT_LEN = 30;
// 優化輸出條件，避免單字頻繁輸出
const INTERIM_COMMIT_MS = 3000; // 增加至3秒，減少頻繁輸出
const INTERIM_COMMIT_DELTA = 8; // 保持合理的字數差距門檻
const INTERIM_COMMIT_PUNCT = /[，。；、！？,.!?]$/; // 句末標點立即提交
const MIN_WORD_COUNT = 3; // 最少需要3個字才考慮輸出
const MIN_CHAR_COUNT = 4; // 最少需要4個字符才考慮輸出
const MIN_FINAL_COMMIT_CHARS = 2; // 最終提交至少2字，避免單字落盤

// 防止重複文字的去重邏輯 - 放寬檢測條件
let textHistory = new Set();
const MAX_HISTORY_SIZE = 20; // 減少歷史記錄大小

function normalizeText(text) {
  return (text || "").toString().replace(/\s+/g, " ").trim();
}

function isDuplicateText(text) {
  const norm = normalizeText(text);
  if (!norm) return true;
  
  // 檢查是否與最後提交的文字相同
  if (norm === lastCommittedNorm) {
    console.log(`🔍 重複檢查: "${text}" -> 與最後提交相同，視為重複`);
    return true;
  }
  
  // 檢查是否在歷史記錄中
  const isDupe = textHistory.has(norm);
  console.log(`🔍 重複檢查: "${text}" -> ${isDupe ? '重複' : '新文字'}`);
  
  // 不在這裡添加到歷史記錄，而是在實際添加到顯示時才添加
  // 這樣可以避免誤判和重複添加
  
  return isDupe;
}

function updateLatest(text) {
  console.log("🔄 updateLatest 被調用:", text);
  const el = document.getElementById("liveTranscription_latest");
  if (!el) {
    console.log("❌ 找不到 liveTranscription_latest 元素");
    return;
  }
  const trimmed = (text || "").toString().trim();
  const norm = normalizeText(trimmed);
  if (norm && norm === lastCommittedNorm) { 
    console.log("❌ 與已提交內容相同，清空顯示");
    el.textContent = ""; 
    return; 
  }
  el.textContent = trimmed ? trimmed : "";
  console.log("✅ 更新 latest 元素內容:", trimmed);
}

function accumulateInterim(text) {
  console.log("📝 accumulateInterim 被調用:", text);
  // 保持上方最新暫時文字顯示
  const raw = (text || "").toString();
  const hasLongTrailingSpace = /\s{3,}$/.test(raw);
  const trimmed = raw.trim();
  if (!trimmed) {
    updateLatest("");
    return;
  }

  // 檢查最小字數和字符數要求
  const wordCount = trimmed.split(/\s+/).length;
  const charCount = trimmed.length;
  
  // 如果不滿足最小要求，只更新顯示但不提交
  if (wordCount < MIN_WORD_COUNT && charCount < MIN_CHAR_COUNT && !INTERIM_COMMIT_PUNCT.test(trimmed)) {
    updateLatest(trimmed);
    console.log(`⏳ 文字太短 (${wordCount}字/${charCount}字符)，暫不提交`);
    return;
  }

  updateLatest(trimmed);

  // 串流式提交暫時結果：符合條件即落盤為段落，貼近嵌入式表現
  const now = performance.now();
  const norm = normalizeText(trimmed);
  const sinceLastCommit = now - (interimLastCommitMs || 0);
  let shouldCommit = false;

  if (INTERIM_COMMIT_PUNCT.test(trimmed)) {
    shouldCommit = true; // 有句末標點立即提交
  } else if (norm.length >= INTERIM_COMMIT_LEN) {
    shouldCommit = true; // 累積字數達閾值
  } else if (sinceLastCommit >= INTERIM_COMMIT_MS && Math.abs(norm.length - (lastCommittedNorm ? lastCommittedNorm.length : 0)) >= INTERIM_COMMIT_DELTA) {
    // 額外檢查：即使時間到了，也要滿足最小字數要求
    if (wordCount >= MIN_WORD_COUNT || charCount >= MIN_CHAR_COUNT) {
      shouldCommit = true; // 過了時間且字數差距達閾值，且滿足最小要求
    }
  }

  // 末尾存在長空白（>=3），視為停頓，但仍需滿足最小要求
  if (hasLongTrailingSpace && (wordCount >= MIN_WORD_COUNT || charCount >= MIN_CHAR_COUNT)) {
    shouldCommit = true;
  }

  if (shouldCommit && norm && norm !== lastCommittedNorm) {
    appendTranscript(trimmed);
    interimBuffer = "";
    interimLastCommitMs = now;
    lastCommittedText = trimmed;
    lastCommittedNorm = norm;
    updateLatest("");
    console.log("✅ 暫時結果已落盤為段落");
  } else {
    // 累積暫時緩衝（如需未來更細緻合併可在此擴充）
    interimBuffer = norm;
  }
}
 
function createTranscriptRow(startSec, endSec, text) {
  const row = document.createElement("div");
  const time = document.createElement("span");
  time.className = "time-tag";
  time.textContent = formatTimeRange(startSec, endSec);
  const content = document.createElement("span");
  content.className = "transcript-text";
  content.textContent = ` ${text}`;
  row.appendChild(time);
  row.appendChild(content);
  return row;
}

function initDummyData() {
  const el = document.getElementById("liveTranscription_presentation");
  if (!el) return;
  
  // 1. ⚠️ 遠端未回應，啟用本地辨識備援。
  const row1 = createTranscriptRow(0, 0, "⚠️ 遠端未回應，啟用本地辨識備援。");
  el.appendChild(row1);

  // 2. 測試測試 (0:00 - 0:03)
  const row2 = createTranscriptRow(0, 3, "測試測試");
  el.appendChild(row2);

  // 3. 測試。 (0:03 - 0:04)
  const row3 = createTranscriptRow(3, 4, "測試。");
  el.appendChild(row3);

  el.scrollTop = el.scrollHeight;
}

function appendTranscript(text) {
  console.log("📋 appendTranscript 被調用:", text);
  const el = document.getElementById("liveTranscription_presentation");
  if (!el) {
    console.error("❌ 找不到 liveTranscription_presentation 元素");
    return;
  }
  const trimmed = (text || "").toString().trim();
  if (!trimmed) {
    console.log("❌ 空文字，跳過");
    return;
  }
  // 最小字數門檻：避免單字就落盤（除非句末標點）
  if (trimmed.length < MIN_FINAL_COMMIT_CHARS && !INTERIM_COMMIT_PUNCT.test(trimmed)) {
    console.log("⏭️ 文字過短，僅更新latest不落盤");
    updateLatest(trimmed);
    return;
  }
  
  const norm = normalizeText(trimmed);
  // 檢查是否重複：與最後提交相同或在歷史記錄中
  if (norm === lastCommittedNorm) {
    console.log("⏭️ 重複文字（與最後提交相同），跳過");
    updateLatest("");
    return;
  }
  
  // 檢查是否在歷史記錄中
  if (textHistory.has(norm)) {
    console.log("⏭️ 重複文字（在歷史記錄中），跳過");
    updateLatest("");
    return;
  }
  
  // 比較前後句內容，移除重複部分
  let finalText = trimmed;
  if (lastCommittedText) {
    // 檢查新句子是否包含上一句的內容
    if (trimmed.includes(lastCommittedText)) {
      // 移除重複部分，只保留新增的內容
      const uniquePart = trimmed.substring(trimmed.indexOf(lastCommittedText) + lastCommittedText.length);
      if (uniquePart.trim()) {
        console.log("🔍 發現重複內容，只保留新增部分");
        finalText = uniquePart.trim();
      }
    } 
    // 檢查上一句是否包含新句子的開頭部分
    else {
      // 尋找最長的共同前綴
      let commonPrefixLength = 0;
      const minLength = Math.min(lastCommittedText.length, trimmed.length);
      
      // 從句子開頭開始，找出共同的字符
      for (let i = 0; i < minLength; i++) {
        if (lastCommittedText[i] === trimmed[i]) {
          commonPrefixLength++;
        } else {
          break;
        }
      }
      
      // 如果有明顯的共同前綴（至少5個字符），則移除
      if (commonPrefixLength >= 5) {
        console.log(`🔍 發現共同前綴（${commonPrefixLength}個字符），移除重複部分`);
        finalText = trimmed.substring(commonPrefixLength).trim();
      }
    }
  }
  
  // 如果處理後的文字為空，則跳過
  if (!finalText) {
    console.log("❌ 移除重複部分後為空，跳過");
    updateLatest("");
    return;
  }
  
  console.log("✅ 添加轉錄內容:", finalText);

  // 計算時間範圍（維持原本 UI 樣式）
  const nowSec = recordingStartTs ? (performance.now() - recordingStartTs) / 1000 : 0;
  const startSec = lastPhraseEndSec || 0;
  const endSec = nowSec > startSec ? nowSec : startSec;
  lastPhraseEndSec = endSec;

  // 添加到歷史記錄（Set，避免重複）
  const finalNorm = normalizeText(finalText);
  textHistory.add(finalNorm);
  if (textHistory.size > MAX_HISTORY_SIZE) {
    const firstItem = textHistory.values().next().value;
    textHistory.delete(firstItem);
  }

  // 生成一行字幕（時間標籤 + 文字）
  const row = createTranscriptRow(startSec, endSec, finalText);
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;

  // 更新狀態與緩衝
  lastCommittedText = finalText;
  lastCommittedNorm = finalNorm;
  interimLastCommitMs = performance.now();
  interimBuffer = "";
  updateLatest("");
  console.log("📄 轉錄內容已添加到頁面");
}

  function setupSttMessaging() {
  if (!sttIframe) return;
  sttIframe.addEventListener("load", () => {
    sttReady = true;
    updateRemoteStatus("✅ 遠端頁已載入");
    // 嘗試握手通知（若對方支援）
    try {
      sttIframe.contentWindow.postMessage({ type: "handshake" }, STT_ORIGIN);
    } catch {}
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== STT_ORIGIN) return;
    lastSttMessageTs = Date.now();
    const data = event.data || {};
    if (data.type === "transcript" && typeof data.text === "string") {
      // 遠端最終轉錄結果
      updateActivityTime(); // 更新活動時間
      if (typeof data.text === "string") {
        appendTranscript(data.text);
        updateLatest("");
      }
      // 遠端開始回傳轉錄，關閉本地備援
      if (srActive && sr) {
        try { sr.stop(); } catch {}
        srActive = false;
        appendTranscript("🟢 已接收遠端轉錄，停止本地備援。");
      }
      // 不論本地辨識是否啟用，停止守護計時器避免干擾
      stopSrGuard();
      stopSrKeepAlive();
    } else if (data.type === "partial" && typeof data.text === "string") {
      // 遠端暫時結果：僅更新最新區，不落盤，以符合嵌入式顯示
      updateActivityTime(); // 更新活動時間
      updateLatest((data.text || "").toString());
      // 收到遠端暫時結果即關閉本地備援，避免併行造成差異
      if (srActive && sr) { try { sr.stop(); } catch {} srActive = false; }
      stopSrGuard();
      stopSrKeepAlive();
    } else if (data.type === "status") {
      if (data.state === "started") {
        // 清除遠端開錄回退定時器
        if (remoteStartTimer) { clearTimeout(remoteStartTimer); remoteStartTimer = null; }
        recordBtn.dataset.state = "recording";
        recordBtn.textContent = "停止錄音";
        isRecording = true;
        recordingStartTs = performance.now();
        lastPhraseEndSec = 0;
        interimBuffer = "";
        lastCommittedText = "";
        lastCommittedNorm = "";
        interimLastCommitMs = performance.now();
        updateLatest("");
        updateRemoteStatus("⏺️ 遠端已開始錄音");
        startHeartbeat();
      } else if (data.state === "stopped") {
        updateLatest("");
        updateRemoteStatus("⏹️ 遠端已停止錄音");
        // 若仍在錄音狀態，嘗試自動重啟遠端錄音
        if (isRecording) {
          try { sttIframe.contentWindow.postMessage({ type: "startRecording", deviceId: micSelect?.value }, STT_ORIGIN); } catch {}
        } else {
          recordBtn.dataset.state = "idle";
          recordBtn.textContent = "開始錄音";
        }
      }
    } else {
      // 其他訊息僅記錄除錯
      console.debug("STT 未知訊息", data);
    }
  });
}

  function startHeartbeat() {
  stopHeartbeat();
  const heartbeatQuietMs = 15000; // 15 秒無訊息則嘗試重啟遠端錄音
  const restartCooldownMs = 5000; // 重啟冷卻
  let lastRestartTs = 0;
  const deviceId = micSelect && micSelect.value ? micSelect.value : undefined;
  window.__sttHeartbeat = setInterval(() => {
    if (!isRecording) return;
    const now = Date.now();
    if (lastSttMessageTs && now - lastSttMessageTs > heartbeatQuietMs) {
      if (now - lastRestartTs > restartCooldownMs) {
        try {
          sttIframe.contentWindow.postMessage({ type: "startRecording", deviceId }, STT_ORIGIN);
          lastRestartTs = now;
          appendTranscript("⏳ 重新啟動遠端錄音…");
        } catch (e) { console.error("遠端重啟失敗", e); }
      }
    }
  }, 5000);
}
function stopHeartbeat() {
  if (window.__sttHeartbeat) {
    clearInterval(window.__sttHeartbeat);
    window.__sttHeartbeat = null;
  }
}

const SR_GUARD_INTERVAL_MS = 55000; // 避免長句或內部限制導致結束
function startSrGuard() {
  stopSrGuard();
  srGuardTimer = setInterval(() => {
    if (srActive && isRecording && sr) {
      try { sr.stop(); } catch {}
      // 重啟動作由 onend 觸發維持安全序
    }
  }, SR_GUARD_INTERVAL_MS);
}
function stopSrGuard() {
  if (srGuardTimer) { clearInterval(srGuardTimer); srGuardTimer = null; }
}
function startSrKeepAlive() {
  stopSrKeepAlive();
  srKeepAliveTimer = setInterval(() => {
    if (srActive && isRecording) {
      const now = Date.now();
      const quietMs = now - (lastSrResultTs || srSessionStartTs);
      
      // 起始保護期：啟動後5秒內不觸發重啟
      if (now - srSessionStartTs < SR_POST_START_GRACE_MS) {
        return;
      }
      
      // 首結果門檻：只有在本輪已產生任一結果後才啟用保活重啟
      if (!hasSrResultSinceStart) {
        return;
      }
      
      // 靜音狀態檢查：若持續靜音則不觸發重啟，改顯示等待語音
      if (isSilence) {
        // 可以在這裡更新UI顯示「等待語音輸入...」
        return;
      }
      
      if (quietMs > SR_KEEPALIVE_QUIET_MS && (now - lastSrRestartTs) >= MIN_SR_RESTART_INTERVAL_MS) {
        console.log("🧰 SR保活: 8秒無結果，觸發重啟");
        lastSrRestartTs = now; // 更新重啟時間戳
        // 在重啟前，若有殘留暫時文字，先落盤避免遺失
        const latestEl = document.getElementById("liveTranscription_latest");
        const latestText = latestEl ? latestEl.textContent.trim() : "";
        if (latestText && latestText.length >= MIN_FINAL_COMMIT_CHARS) {
          appendTranscript(latestText);
          updateLatest("");
        }
        try { sr.stop(); } catch {}
      }
    }
  }, SR_KEEPALIVE_CHECK_MS);
}
function stopSrKeepAlive() {
  if (srKeepAliveTimer) { clearInterval(srKeepAliveTimer); srKeepAliveTimer = null; }
}

// 🔈 靜音監測（AudioContext + Analyser）
let audioCtx = null;
let audioStream = null;
let analyser = null;
let silenceTimer = null;
let lastNonSilentMs = 0;
let lastSilenceCommitMs = 0;
let isSilence = true; // 當前是否處於靜音狀態
const SILENCE_THRESHOLD = 0.02; // RMS 振幅門檻
const SILENCE_CHECK_INTERVAL_MS = 200; // 監測間隔
const SILENCE_MS_TO_COMMIT = 1200; // 靜音持續時間達此值則提交暫時文字
const SILENCE_COMMIT_COOLDOWN_MS = 1500; // 提交冷卻，避免重複提交

// 自動重啟相關函數
function startAutoRestartTimer() {
  stopAutoRestartTimer();
  autoRestartTimer = setTimeout(() => {
    if (isRecording) {
      console.log("🔄 2秒內無活動，自動重啟語音辨識");
      appendTranscript("🔄 自動重啟語音辨識...");
      restartRecording();
    }
  }, AUTO_RESTART_DELAY_MS);
}

function stopAutoRestartTimer() {
  if (autoRestartTimer) {
    clearTimeout(autoRestartTimer);
    autoRestartTimer = null;
  }
}

function updateActivityTime() {
  lastActivityTime = Date.now();
  stopAutoRestartTimer(); // 有活動時停止重啟計時器
}

async function restartRecording() {
  if (!isRecording) return;
  
  console.log("🔄 執行語音辨識重啟");
  const deviceId = micSelect && micSelect.value ? micSelect.value : undefined;
  
  // 停止當前辨識
  if (srActive && sr) {
    try { sr.stop(); } catch {}
    srActive = false;
  }
  
  // 停止遠端辨識
  if (USE_REMOTE_STT && sttIframe) {
    try { sttIframe.contentWindow.postMessage({ type: "stopRecording" }, STT_ORIGIN); } catch {}
  }
  
  stopSilenceMonitor();
  stopSrKeepAlive();
  
  // 短暫延遲後重新開始
  setTimeout(async () => {
    if (!isRecording) return; // 確保仍在錄音狀態
    
    console.log("🎤 重新啟動語音辨識");
    
    // 重新啟動遠端辨識
    if (USE_REMOTE_STT && sttIframe) {
      try {
        sttIframe.contentWindow.postMessage({ type: "startRecording", deviceId }, STT_ORIGIN);
        updateRemoteStatus("🔄 重新啟動遠端錄音");
      } catch (e) {
        console.error("遠端重啟失敗", e);
      }
    }
    
    // 重新啟動本地辨識
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      sr = new SR();
      sr.lang = "zh-TW";
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e) => {
        lastSrResultTs = Date.now();
        hasSrResultSinceStart = true; // 標記本輪已產生結果
        updateActivityTime(); // 更新活動時間
        let finals = [], interims = [];
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const t = r[0] && r[0].transcript ? r[0].transcript.trim() : "";
          if (!t) continue;
          if (r.isFinal) finals.push(t);
          else interims.push(t);
        }
        if (interims.length) accumulateInterim(interims.join(" "));
        if (finals.length) appendTranscript(finals.join(" "));
      };
      sr.onerror = (e) => {
        const err = e && e.error;
        if (srActive && isRecording && err !== "not-allowed" && err !== "service-not-allowed") {
          setTimeout(() => { if (srActive && isRecording) { try { sr.start(); } catch {} } }, 1000);
        }
      };
      sr.onend = () => {
        const latestEl = document.getElementById("liveTranscription_latest");
        const latestText = latestEl ? latestEl.textContent.trim() : "";
        if (latestText && latestText.length >= MIN_FINAL_COMMIT_CHARS) { appendTranscript(latestText); updateLatest(""); }
        if (srActive && isRecording) {
          setTimeout(() => {
            if (srActive && isRecording) {
              try { 
                hasSrResultSinceStart = false; // 重置首結果門檻
                srSessionStartTs = Date.now(); // 記錄會話開始時間
                sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
              } catch (e) { console.error("Local SR start failed", e); }
            }
          }, 500);
        }
      };
      try { 
        hasSrResultSinceStart = false; // 重置首結果門檻
        srSessionStartTs = Date.now(); // 記錄會話開始時間
        sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
      } catch (e) { console.error("Local SR start failed", e); }
    }
    
    updateActivityTime(); // 重啟後更新活動時間
  }, 500);
}

async function startSilenceMonitor(deviceId) {
  stopSilenceMonitor();
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
  try {
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    audioStream = await navigator.mediaDevices.getUserMedia(constraints);
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(audioStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.fftSize);
    lastNonSilentMs = Date.now();

    silenceTimer = setInterval(() => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buffer);
      // 計算 RMS（歸一化到 [-1,1]）
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128.0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const now = Date.now();
      if (rms > SILENCE_THRESHOLD) {
        lastNonSilentMs = now;
        isSilence = false; // 偵測到音量，非靜音狀態
        updateActivityTime(); // 有聲音時更新活動時間
      } else {
        // 檢查是否已靜音超過一定時間
        const quietForMs = now - lastNonSilentMs;
        if (quietForMs >= 1000) { // 靜音超過1秒才標記為靜音狀態
          isSilence = true;
        }
      }
      const quietForMs = now - lastNonSilentMs;
      if (quietForMs >= SILENCE_MS_TO_COMMIT) {
        // 若最新顯示有暫時文字，觸發強制提交
        const latestEl = document.getElementById("liveTranscription_latest");
        const latestText = latestEl ? latestEl.textContent.trim() : "";
        if (latestText && latestText.trim().length >= MIN_FINAL_COMMIT_CHARS && (now - lastSilenceCommitMs) >= SILENCE_COMMIT_COOLDOWN_MS) {
          appendTranscript(latestText);
          updateLatest("");
          lastSilenceCommitMs = now;
        }
        // 靜音超過2秒，啟動自動重啟計時器
        if (quietForMs >= AUTO_RESTART_DELAY_MS) {
          startAutoRestartTimer();
        }
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  } catch (err) {
    console.warn("靜音監測無法啟動:", err);
  }
}

function stopSilenceMonitor() {
  if (silenceTimer) { clearInterval(silenceTimer); silenceTimer = null; }
  if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
  if (audioStream) {
    try { audioStream.getTracks().forEach(t => t.stop()); } catch {}
    audioStream = null;
  }
  analyser = null;
  stopAutoRestartTimer(); // 停止監測時也停止自動重啟計時器
}

function setupRecordingControls() {
  if (USE_REMOTE_STT) setupSttMessaging();
  loadMicDevices();
  // 初始提示：若遠端頁未在短時間載入，提醒可能為憑證問題
  updateRemoteStatus("🌐 正在連線遠端…");
  setTimeout(() => { if (!sttReady) updateRemoteStatus("⚠️ 遠端頁未載入，可能為憑證問題"); }, 4000);
  // 註冊一次 devicechange 監聽，使用防抖避免頻繁重載
  if (!window.__deviceChangeListenerAttached && navigator.mediaDevices) {
    try {
      if (navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener("devicechange", debouncedLoadMicDevices);
      } else {
        navigator.mediaDevices.ondevicechange = debouncedLoadMicDevices;
      }
      window.__deviceChangeListenerAttached = true;
    } catch (e) {
      // 某些環境不支援，忽略
    }
  }

  if (!recordBtn) return;
  recordBtn.addEventListener("click", async () => {
    if (!devicesLoaded) await loadMicDevices();

    const deviceId = micSelect && micSelect.value ? micSelect.value : undefined;

    if (!isRecording) {
      // 遠端模式：透過 iframe 啟動錄音，失敗則回退本地
      if (USE_REMOTE_STT && sttIframe) {
        try {
          updateLatest("");
          updateRemoteStatus("📨 已送出遠端錄音要求");
          sttIframe.contentWindow.postMessage({ type: "startRecording", deviceId }, STT_ORIGIN);
          // 若非嚴格模式：遠端未在指定時間內回覆 started，啟用本地備援辨識
if (!REMOTE_STRICT_MODE) {
  if (remoteStartTimer) { clearTimeout(remoteStartTimer); }
  remoteStartTimer = setTimeout(() => {
    if (!isRecording) {
      console.warn("⚠️ 遠端未回應，啟用本地辨識備援");
      appendTranscript("⚠️ 遠端未回應，啟用本地辨識備援。");
      updateRemoteStatus("⚠️ 遠端未回應，啟用本地備援");
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        appendTranscript("❌ 本地語音辨識不可用，請使用支援的瀏覽器。");
        return;
      }
      recordBtn.dataset.state = "recording";
      recordBtn.textContent = "停止錄音";
      isRecording = true;
      recordingStartTs = performance.now();
      lastPhraseEndSec = 0;
      updateLatest("");
      sr = new SR();
      sr.lang = "zh-TW";
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e) => {
        lastSrResultTs = Date.now();
        hasSrResultSinceStart = true; // 標記本輪已產生結果
        updateActivityTime(); // 更新活動時間
        let finals = [], interims = [];
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const t = r[0] && r[0].transcript ? r[0].transcript.trim() : "";
          if (!t) continue;
          if (r.isFinal) finals.push(t);
          else interims.push(t);
        }
        if (interims.length) accumulateInterim(interims.join(" "));
        if (finals.length) appendTranscript(finals.join(" "));
      };
      sr.onerror = (e) => {
        const err = e && e.error;
        if (srActive && isRecording && err !== "not-allowed" && err !== "service-not-allowed") {
          setTimeout(() => { if (srActive && isRecording) { try { sr.start(); } catch {} } }, 1000);
        }
      };
      sr.onend = () => {
        const latestEl = document.getElementById("liveTranscription_latest");
        const latestText = latestEl ? latestEl.textContent.trim() : "";
        if (latestText && latestText.length >= MIN_FINAL_COMMIT_CHARS) { appendTranscript(latestText); updateLatest(""); }
        if (srActive && isRecording) {
          setTimeout(() => {
            if (srActive && isRecording) {
              try { 
                hasSrResultSinceStart = false; // 重置首結果門檻
                srSessionStartTs = Date.now(); // 記錄會話開始時間
                sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
              } catch (e) { console.error("Local SR start failed", e); }
            }
          }, 500);
        }
      };
      try { 
        hasSrResultSinceStart = false; // 重置首結果門檻
        srSessionStartTs = Date.now(); // 記錄會話開始時間
        sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
      } catch (e) { console.error("Local SR start failed", e); }
    }
  }, REMOTE_START_TIMEOUT_MS);
}
          return; // 等待遠端回傳狀態與內容（status: started）
        } catch (e) {
          console.error("遠端 startRecording 失敗，改用本地", e);
          appendTranscript("❌ 無法啟動遠端轉錄，改用本地。");
          updateRemoteStatus("❌ 遠端啟動失敗，改用本地");
        }
      }

      // 開始錄音（本地）
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        appendTranscript("❌ 本地語音辨識不可用，請使用支援的瀏覽器。");
        return;
      }
      recordBtn.dataset.state = "recording";
      recordBtn.textContent = "停止錄音";
      isRecording = true;
      updateLatest("");
      sr = new SR();
      sr.lang = "zh-TW";
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e) => {
        lastSrResultTs = Date.now();
        hasSrResultSinceStart = true; // 標記本輪已產生結果
        updateActivityTime(); // 更新活動時間
        let finals = [], interims = [];
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const t = r[0] && r[0].transcript ? r[0].transcript.trim() : "";
          if (!t) continue;
          if (r.isFinal) finals.push(t);
          else interims.push(t);
        }
        if (interims.length) accumulateInterim(interims.join(" "));
        if (finals.length) appendTranscript(finals.join(" "));
      };
      sr.onerror = (e) => {
        const err = e && e.error;
        if (srActive && isRecording && err !== "not-allowed" && err !== "service-not-allowed") {
          setTimeout(() => { if (srActive && isRecording) { try { sr.start(); } catch {} } }, 1000);
        }
      };
      sr.onend = () => {
        // 在辨識結束時，若有殘留暫時文字，先提交
        const latestEl = document.getElementById("liveTranscription_latest");
        const latestText = latestEl ? latestEl.textContent.trim() : "";
        if (latestText && latestText.length >= MIN_FINAL_COMMIT_CHARS) {
          appendTranscript(latestText);
          updateLatest("");
        }
        if (srActive && isRecording) {
          setTimeout(() => {
            if (srActive && isRecording) {
              try { 
                hasSrResultSinceStart = false; // 重置首結果門檻
                srSessionStartTs = Date.now(); // 記錄會話開始時間
                sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
              } catch (e) { console.error("Local SR start failed", e); }
            }
          }, 500);
        }
      };
      try { 
        hasSrResultSinceStart = false; // 重置首結果門檻
        srSessionStartTs = Date.now(); // 記錄會話開始時間
        sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
      } catch (e) { console.error("Local SR start failed", e); }
    } else {
      console.log("🛑 停止錄音");
      // 停止錄音（遠端或本地）
      if (USE_REMOTE_STT && sttIframe) {
        isRecording = false;
        updateLatest("");
        // 停止時也清除回退定時器，避免殘留
        if (remoteStartTimer) { clearTimeout(remoteStartTimer); remoteStartTimer = null; }
        try { sttIframe.contentWindow.postMessage({ type: "stopRecording" }, STT_ORIGIN); } catch {}
        stopHeartbeat();
        if (srActive && sr) { try { sr.stop(); } catch {} srActive = false; }
        recordBtn.dataset.state = "idle";
        recordBtn.textContent = "開始錄音";
        stopSrGuard();
        stopSrKeepAlive();
        stopSilenceMonitor();
        stopAutoRestartTimer(); // 停止錄音時停止自動重啟計時器
        console.log("✅ 已指示遠端停止錄音");
        updateRemoteStatus("⏹️ 已指示遠端停止");
        return;
      }

      recordBtn.dataset.state = "idle";
      recordBtn.textContent = "開始錄音";
      isRecording = false;
      updateLatest("");
      interimBuffer = "";
      lastCommittedText = "";
      interimLastCommitMs = 0;
      if (srActive && sr) { try { sr.stop(); } catch {} srActive = false; }
      stopSrGuard();
      stopSrKeepAlive();
      stopSilenceMonitor();
      stopAutoRestartTimer(); // 停止錄音時停止自動重啟計時器
      console.log("✅ 錄音已停止");
    }

  });
}

  function initCanvas() {
    pdfContainer.innerHTML = "";
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    // 由渲染尺寸主導，不強制以 CSS 拉滿寬度
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.display = "block";
    pdfContainer.appendChild(canvas);
  }

  async function loadPDF(fileUrl) {
    if (!pdfContainer || !window['pdfjsLib']) return;
    initCanvas();
    try {
      const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
      pdfDoc = await loadingTask.promise;
      currentPage = 1;
      await renderPage(currentPage);
      syncSlider();
    } catch (err) {
      console.error("載入PDF失敗:", err);
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "#fff";
      errorDiv.style.padding = "1em";
      errorDiv.textContent = "PDF 載入失敗，請確認檔案路徑或網路狀態。";
      pdfContainer.appendChild(errorDiv);
    }
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || !canvas || !ctx) return;
    
    // 取消前一個渲染任務，防止重複渲染錯誤
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch (e) {
        // 忽略取消錯誤
      }
      renderTask = null;
    }
    
    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const containerWidth = pdfContainer.parentElement.clientWidth || pdfContainer.parentElement.offsetWidth || 800;
    const containerHeight = pdfContainer.parentElement.clientHeight || pdfContainer.parentElement.offsetHeight || 600;
    const scale = Math.min(
      containerWidth / baseViewport.width,
      containerHeight / baseViewport.height
    );
    const viewport = page.getViewport({ scale });

    // DPI-aware渲染：使用devicePixelRatio調整canvas尺寸
    const dpr = window.devicePixelRatio || 1;
    
    // CSS尺寸（顯示尺寸）
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';
    
    // 實際畫布像素（乘上DPI比例）
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);

    const renderContext = { 
      canvasContext: ctx, 
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    };
    
    try {
      renderTask = page.render(renderContext);
      await renderTask.promise;
      renderTask = null;
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error("渲染頁面失敗:", err);
      }
      renderTask = null;
    }
  }

  function showSlide(idx) {
    if (pdfFiles[idx]) {
      currentIdx = idx;
      loadPDF(pdfFiles[idx]);
      if (pdfSelect) pdfSelect.value = String(idx);
    }
  }

  // 初始化IndexedDB並載入已存PDF，然後載入預設簡報
  try {
    await initPdfDB();
    await loadStoredPdfs(pdfFiles, pdfSelect);
  } catch (error) {
    console.error('IndexedDB初始化或載入失敗:', error);
  }
  
  // 預設載入第一個簡報
  showSlide(0);

  // 啟用語音轉錄控制
  setupRecordingControls();

  // 下拉選單切換 PDF
  if (pdfSelect) {
    pdfSelect.addEventListener("change", () => {
      const idx = parseInt(pdfSelect.value, 10);
      showSlide(idx);
    });
  }

  function goToPage(target) {
    if (!pdfDoc) return;
    const clamped = Math.min(Math.max(target, 1), pdfDoc.numPages);
    if (clamped === currentPage) return;
    currentPage = clamped;
    renderPage(currentPage);
    syncSlider();
  }

  // 右側頁數滑桿控制頁面
  if (pageSlider) {
    pageSlider.addEventListener("input", () => {
      if (!pdfDoc) return;
      const val = parseInt(pageSlider.value, 10);
      if (Number.isNaN(val)) return;
      goToPage(val);
    });
  }

  // 上下箭頭按鈕控制
  if (pageArrowUp) {
    pageArrowUp.addEventListener("click", () => {
      goToPage(currentPage - 1);
    });
  }
  if (pageArrowDown) {
    pageArrowDown.addEventListener("click", () => {
      goToPage(currentPage + 1);
    });
  }

  // 在 PDF 容器上使用滑鼠滾輪換頁
  if (pdfContainer) {
    pdfContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!pdfDoc || wheelLock) return;
      wheelLock = true;
      const dir = e.deltaY > 0 ? 1 : -1; // 向下下一頁，向上上一頁
      let next = currentPage + dir;
      if (next < 1) next = 1;
      if (next > pdfDoc.numPages) next = pdfDoc.numPages;
      if (next !== currentPage) {
        goToPage(next);
      }
      setTimeout(() => { wheelLock = false; }, 200);
    }, { passive: false });
  }

  // 即時語音轉錄更新（教師端）
  window.addEventListener('liveTranscriptionUpdate', (e) => {
    const panel = document.getElementById('liveTranscription_presentation');
    if (panel) panel.innerHTML = e.detail;
  });

  // 畫面尺寸變動時，重新渲染目前頁面（延遲以減少重繪）
  window.addEventListener("resize", () => {
    clearTimeout(window.__pdfResizeTimer);
    window.__pdfResizeTimer = setTimeout(() => {
      renderPage(currentPage);
    }, 200);
  });

  // 全螢幕切換時，重新渲染目前頁面
  document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
      renderPage(currentPage);
    }, 200); // 延遲以確保容器尺寸已更新
  });

  // 載入預設測試資料
  initDummyData();
});
