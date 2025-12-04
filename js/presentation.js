// presentation.js
// 使用 PDF.js 渲染簡報，支援下拉選單切換與滑鼠滾輪換頁

// ===== IndexedDB PDF 持久化功能 =====
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

function savePdfFile(file) {
  return new Promise((resolve, reject) => {
    if (!pdfDB) { reject(new Error('Database not initialized')); return; }
    const tx = pdfDB.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const record = { name: file.name, blob: file, addedAt: Date.now() };
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function loadStoredPdfs(pdfFilesRef, pdfSelectEl) {
  return new Promise((resolve, reject) => {
    if (!pdfDB) { resolve(); return; }
    const tx = pdfDB.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const req = store.getAll();
    req.onsuccess = () => {
      try {
        const records = req.result || [];
        for (const r of records) {
          const url = URL.createObjectURL(r.blob);
          pdfFilesRef.push(url);
          if (pdfSelectEl) {
            const opt = new Option(r.name, String(pdfFilesRef.length - 1));
            pdfSelectEl.appendChild(opt);
          }
        }
        resolve();
      } catch (err) { reject(err); }
    };
    req.onerror = () => reject(req.error);
  });
}

// ===== 強制捲動到底部函式 (針對歷史列表) =====
function scrollToBottom() {
  const el = document.getElementById("liveTranscription_presentation");
  if (el) {
    // 立即捲動
    el.scrollTop = el.scrollHeight;
    // 延遲捲動確保渲染完成
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }
}

// ===== 強制捲動暫存框 (針對左側白框) =====
function scrollLatestToBottom() {
  const el = document.getElementById("liveTranscription_latest");
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const pdfSelect = document.getElementById("pdfSelect");
  const pdfContainer = document.getElementById("pdfContainer");
  const pageSlider = document.getElementById("pageSlider");
  const pageArrowUp = document.getElementById("pageArrowUp");
  const pageArrowDown = document.getElementById("pageArrowDown");

  // 語音轉錄變數
  const recordBtn = document.getElementById("recordBtn");
  const micSelect = document.getElementById("micSelect");
  const sttIframe = document.getElementById("sttIframe");
  let sttReady = false;
  let isRecording = false;
  let devicesLoaded = false;
  let lastSttMessageTs = 0;
  let sr;
  let srActive = false;
  let srGuardTimer = null;
  const USE_REMOTE_STT = true;
  const REMOTE_STRICT_MODE = false;
  let lastSrResultTs = 0;
  let lastSrRestartTs = 0;
  let srKeepAliveTimer = null;
  let hasSrResultSinceStart = false;
  let srSessionStartTs = 0;
  const SR_KEEPALIVE_QUIET_MS = 8000;
  const SR_KEEPALIVE_CHECK_MS = 1000;
  const MIN_SR_RESTART_INTERVAL_MS = 2000;
  const SR_POST_START_GRACE_MS = 5000;
  let remoteStartTimer = null;
  let autoRestartTimer = null;
  const AUTO_RESTART_DELAY_MS = 2000;
  let lastActivityTime = 0;
  const REMOTE_START_TIMEOUT_MS = 3000;
  
  const STT_ORIGIN = (function(){
    try { return new URL(sttIframe?.src || "https://avatarai.tplinkdns.com:9000/").origin; }
    catch { return "https://avatarai.tplinkdns.com:9000"; }
  })();

  function updateRemoteStatus(text) {
    const el = document.getElementById("remoteSttStatus");
    if (el) {
        el.textContent = text || "";
        el.style.display = text ? "block" : "none";
    }
  }

  // PDF 相關
  const pdfFiles = [
    "assets/簡報/模擬實驗架構(聽障生)-更.pdf",
    "assets/簡報/0818實驗情形講解.pdf"
  ];

  if (window['pdfjsLib']) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  let currentIdx = 0;
  let pdfDoc = null;
  let currentPage = 1;
  let wheelLock = false;
  let canvas = null;
  let ctx = null;
  let renderTask = null;

  const addPdfBtn = document.getElementById("addPdfBtn");
  const pdfFileInput = document.getElementById("pdfFileInput");
  
  if (addPdfBtn && pdfFileInput) {
    addPdfBtn.addEventListener("click", () => pdfFileInput.click());
    pdfFileInput.addEventListener("change", async () => {
      const file = pdfFileInput.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      pdfFiles.push(url);
      const opt = document.createElement("option");
      opt.value = String(pdfFiles.length - 1);
      opt.textContent = file.name;
      pdfSelect.appendChild(opt);
      pdfSelect.value = String(pdfFiles.length - 1);
      showSlide(pdfFiles.length - 1);
      try { await savePdfFile(file); } catch (e) { console.error('PDF持久化失敗:', e); }
      pdfFileInput.value = "";
    });
  }

  function syncSlider() {
    if (!pageSlider) return;
    if (!pdfDoc) {
      pageSlider.disabled = true;
      pageSlider.min = "1"; pageSlider.max = "1"; pageSlider.value = "1";
      return;
    }
    pageSlider.disabled = false;
    pageSlider.min = "1";
    pageSlider.max = String(pdfDoc.numPages);
    pageSlider.value = String(currentPage);
  }

  // 麥克風與音訊
  let loadMicDebounceTimer = null;
  const debouncedLoadMicDevices = () => {
    clearTimeout(loadMicDebounceTimer);
    loadMicDebounceTimer = setTimeout(loadMicDevices, 500);
  };

  let micLabelsUnlocked = false;
  let lastMicDeviceIds = [];
  async function loadMicDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let mics = devices.filter(d => d.kind === "audioinput");
      const allLabelsEmpty = mics.length > 0 && mics.every(d => !d.label);
      if (allLabelsEmpty && !micLabelsUnlocked && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          micLabelsUnlocked = true;
          devices = await navigator.mediaDevices.enumerateDevices();
          mics = devices.filter(d => d.kind === "audioinput");
        } catch (e) {}
      }
      const ids = mics.map(d => d.deviceId || "");
      const changed = ids.length !== lastMicDeviceIds.length || ids.some((id, i) => id !== lastMicDeviceIds[i]);

      if (changed) {
        micSelect.innerHTML = "";
        if (mics.length === 0) {
          const opt = document.createElement("option");
          opt.textContent = "未偵測到麥克風"; opt.value = "";
          micSelect.appendChild(opt); micSelect.disabled = true;
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
    } catch (err) { console.error("列舉麥克風失敗", err); }
  }

  function formatTimeRange(startSec, endSec) {
    const fmt = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
    };
    return `${fmt(startSec)} - ${fmt(endSec)}`;
  }

  // 轉錄邏輯變數
  let recordingStartTs = 0;
  let lastPhraseEndSec = 0;
  let interimBuffer = "";
  let interimLastCommitMs = 0;
  let lastCommittedText = "";
  let lastCommittedNorm = "";
  const INTERIM_COMMIT_LEN = 30;
  const INTERIM_COMMIT_MS = 3000;
  const INTERIM_COMMIT_DELTA = 8;
  const INTERIM_COMMIT_PUNCT = /[，。；、！？,.!?]$/;
  const MIN_WORD_COUNT = 3;
  const MIN_CHAR_COUNT = 4;
  const MIN_FINAL_COMMIT_CHARS = 2;
  let textHistory = new Set();
  const MAX_HISTORY_SIZE = 20;

  function normalizeText(text) { return (text || "").toString().replace(/\s+/g, " ").trim(); }

  // 更新左側暫存框
  function updateLatest(text) {
    const el = document.getElementById("liveTranscription_latest");
    if (!el) return;
    const trimmed = (text || "").toString().trim();
    const norm = normalizeText(trimmed);
    if (norm && norm === lastCommittedNorm) { el.textContent = ""; return; }
    el.textContent = trimmed ? trimmed : "";
    scrollLatestToBottom(); // 自動捲動暫存框
  }

  function accumulateInterim(text) {
    const raw = (text || "").toString();
    const hasLongTrailingSpace = /\s{3,}$/.test(raw);
    const trimmed = raw.trim();
    if (!trimmed) { updateLatest(""); return; }

    const wordCount = trimmed.split(/\s+/).length;
    const charCount = trimmed.length;
    
    if (wordCount < MIN_WORD_COUNT && charCount < MIN_CHAR_COUNT && !INTERIM_COMMIT_PUNCT.test(trimmed)) {
      updateLatest(trimmed); return;
    }

    updateLatest(trimmed);

    const now = performance.now();
    const norm = normalizeText(trimmed);
    const sinceLastCommit = now - (interimLastCommitMs || 0);
    let shouldCommit = false;

    if (INTERIM_COMMIT_PUNCT.test(trimmed)) shouldCommit = true;
    else if (norm.length >= INTERIM_COMMIT_LEN) shouldCommit = true;
    else if (sinceLastCommit >= INTERIM_COMMIT_MS && Math.abs(norm.length - (lastCommittedNorm ? lastCommittedNorm.length : 0)) >= INTERIM_COMMIT_DELTA) {
      if (wordCount >= MIN_WORD_COUNT || charCount >= MIN_CHAR_COUNT) shouldCommit = true;
    }
    if (hasLongTrailingSpace && (wordCount >= MIN_WORD_COUNT || charCount >= MIN_CHAR_COUNT)) shouldCommit = true;

    if (shouldCommit && norm && norm !== lastCommittedNorm) {
      appendTranscript(trimmed);
      interimBuffer = "";
      interimLastCommitMs = now;
      lastCommittedText = trimmed;
      lastCommittedNorm = norm;
      updateLatest("");
    } else {
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
    el.appendChild(createTranscriptRow(0, 0, "⚠️ 遠端未回應，啟用本地辨識備援。"));
    el.appendChild(createTranscriptRow(0, 3, "測試測試"));
    el.appendChild(createTranscriptRow(3, 4, "測試。"));
    scrollToBottom();
  }

  function appendTranscript(text) {
    const el = document.getElementById("liveTranscription_presentation");
    if (!el) return;
    const trimmed = (text || "").toString().trim();
    if (!trimmed) return;
    if (trimmed.length < MIN_FINAL_COMMIT_CHARS && !INTERIM_COMMIT_PUNCT.test(trimmed)) {
      updateLatest(trimmed); return;
    }
    
    const norm = normalizeText(trimmed);
    if (norm === lastCommittedNorm || textHistory.has(norm)) {
      updateLatest(""); return;
    }
    
    let finalText = trimmed;
    if (lastCommittedText) {
      if (trimmed.includes(lastCommittedText)) {
        const uniquePart = trimmed.substring(trimmed.indexOf(lastCommittedText) + lastCommittedText.length);
        if (uniquePart.trim()) finalText = uniquePart.trim();
      } else {
        let commonPrefixLength = 0;
        const minLength = Math.min(lastCommittedText.length, trimmed.length);
        for (let i = 0; i < minLength; i++) {
          if (lastCommittedText[i] === trimmed[i]) commonPrefixLength++; else break;
        }
        if (commonPrefixLength >= 5) finalText = trimmed.substring(commonPrefixLength).trim();
      }
    }
    if (!finalText) { updateLatest(""); return; }

    const nowSec = recordingStartTs ? (performance.now() - recordingStartTs) / 1000 : 0;
    const startSec = lastPhraseEndSec || 0;
    const endSec = nowSec > startSec ? nowSec : startSec;
    lastPhraseEndSec = endSec;

    const finalNorm = normalizeText(finalText);
    textHistory.add(finalNorm);
    if (textHistory.size > MAX_HISTORY_SIZE) textHistory.delete(textHistory.values().next().value);

    el.appendChild(createTranscriptRow(startSec, endSec, finalText));
    scrollToBottom();

    lastCommittedText = finalText;
    lastCommittedNorm = finalNorm;
    interimLastCommitMs = performance.now();
    interimBuffer = "";
    updateLatest("");
  }

  // STT Messaging
  function setupSttMessaging() {
    if (!sttIframe) return;
    sttIframe.addEventListener("load", () => {
      sttReady = true;
      updateRemoteStatus("✅ 遠端頁已載入");
      try { sttIframe.contentWindow.postMessage({ type: "handshake" }, STT_ORIGIN); } catch {}
    });

    window.addEventListener("message", (event) => {
      if (event.origin !== STT_ORIGIN) return;
      lastSttMessageTs = Date.now();
      const data = event.data || {};
      if (data.type === "transcript" && typeof data.text === "string") {
        updateActivityTime();
        if (typeof data.text === "string") { appendTranscript(data.text); updateLatest(""); }
        if (srActive && sr) { try { sr.stop(); } catch {} srActive = false; }
        stopSrGuard(); stopSrKeepAlive();
      } else if (data.type === "partial" && typeof data.text === "string") {
        updateActivityTime();
        updateLatest((data.text || "").toString());
        if (srActive && sr) { try { sr.stop(); } catch {} srActive = false; }
        stopSrGuard(); stopSrKeepAlive();
      } else if (data.type === "status") {
        if (data.state === "started") {
          if (remoteStartTimer) { clearTimeout(remoteStartTimer); remoteStartTimer = null; }
          recordBtn.dataset.state = "recording";
          recordBtn.textContent = "停止錄音";
          isRecording = true;
          recordingStartTs = performance.now();
          lastPhraseEndSec = 0;
          interimBuffer = ""; lastCommittedText = ""; lastCommittedNorm = "";
          interimLastCommitMs = performance.now();
          updateLatest(""); updateRemoteStatus("⏺️ 遠端已開始錄音");
          startHeartbeat();
        } else if (data.state === "stopped") {
          updateLatest(""); updateRemoteStatus("⏹️ 遠端已停止錄音");
          if (isRecording) {
            try { sttIframe.contentWindow.postMessage({ type: "startRecording", deviceId: micSelect?.value }, STT_ORIGIN); } catch {}
          } else {
            recordBtn.dataset.state = "idle"; recordBtn.textContent = "開始錄音";
          }
        }
      }
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    const heartbeatQuietMs = 15000;
    const restartCooldownMs = 5000;
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
  function stopHeartbeat() { if (window.__sttHeartbeat) { clearInterval(window.__sttHeartbeat); window.__sttHeartbeat = null; } }
  
  function startSrGuard() { stopSrGuard(); srGuardTimer = setInterval(() => { if (srActive && isRecording && sr) { try { sr.stop(); } catch {} } }, 55000); }
  function stopSrGuard() { if (srGuardTimer) { clearInterval(srGuardTimer); srGuardTimer = null; } }
  function startSrKeepAlive() {
    stopSrKeepAlive();
    srKeepAliveTimer = setInterval(() => {
      if (srActive && isRecording) {
        const now = Date.now();
        const quietMs = now - (lastSrResultTs || srSessionStartTs);
        if (now - srSessionStartTs < SR_POST_START_GRACE_MS) return;
        if (!hasSrResultSinceStart) return;
        if (quietMs > SR_KEEPALIVE_QUIET_MS && (now - lastSrRestartTs) >= MIN_SR_RESTART_INTERVAL_MS) {
          lastSrRestartTs = now;
          try { sr.stop(); } catch {}
        }
      }
    }, SR_KEEPALIVE_CHECK_MS);
  }
  function stopSrKeepAlive() { if (srKeepAliveTimer) { clearInterval(srKeepAliveTimer); srKeepAliveTimer = null; } }

  function startAutoRestartTimer() { stopAutoRestartTimer(); autoRestartTimer = setTimeout(() => { if (isRecording) restartRecording(); }, AUTO_RESTART_DELAY_MS); }
  function stopAutoRestartTimer() { if (autoRestartTimer) { clearTimeout(autoRestartTimer); autoRestartTimer = null; } }
  function updateActivityTime() { lastActivityTime = Date.now(); stopAutoRestartTimer(); }

  // 錄音控制初始化
  function setupRecordingControls() {
    if (USE_REMOTE_STT) setupSttMessaging();
    loadMicDevices();
    updateRemoteStatus("🌐 正在連線遠端…");
    setTimeout(() => { if (!sttReady) updateRemoteStatus("⚠️ 遠端頁未載入，可能為憑證問題"); }, 4000);
    if (!window.__deviceChangeListenerAttached && navigator.mediaDevices) {
      try { navigator.mediaDevices.ondevicechange = debouncedLoadMicDevices; window.__deviceChangeListenerAttached = true; } catch (e) {}
    }

    if (!recordBtn) return;
    
    // 監聽點擊事件
    recordBtn.addEventListener("click", async () => {
      console.log("Record button clicked"); // Debug Log

      if (!devicesLoaded) await loadMicDevices();
      const deviceId = micSelect && micSelect.value ? micSelect.value : undefined;
      
      if (!isRecording) {
        // 開始錄音
        if (USE_REMOTE_STT && sttIframe) {
          try {
            updateLatest(""); 
            updateRemoteStatus("📨 已送出遠端錄音要求");
            sttIframe.contentWindow.postMessage({ type: "startRecording", deviceId }, STT_ORIGIN);
            
            // 遠端備援邏輯
            if (!REMOTE_STRICT_MODE) {
              if (remoteStartTimer) clearTimeout(remoteStartTimer);
              remoteStartTimer = setTimeout(() => {
                if (!isRecording) {
                  // Fallback: 啟動本地錄音
                  console.warn("⚠️ 遠端未回應，啟用本地辨識備援");
                  startLocalRecording(); 
                }
              }, REMOTE_START_TIMEOUT_MS);
            }
            return;
          } catch (e) { 
             console.error("Remote STT error:", e);
             updateRemoteStatus("❌ 遠端啟動失敗，改用本地");
             // 若 iframe 錯誤，直接啟動本地
             startLocalRecording();
             return;
          }
        }
        // 若無遠端，直接啟動本地
        startLocalRecording();

      } else {
        // 停止錄音
        if (USE_REMOTE_STT && sttIframe) {
          isRecording = false; updateLatest("");
          try { sttIframe.contentWindow.postMessage({ type: "stopRecording" }, STT_ORIGIN); } catch {}
          stopHeartbeat(); stopSrGuard(); stopSrKeepAlive(); stopAutoRestartTimer();
          recordBtn.dataset.state = "idle"; recordBtn.textContent = "開始錄音";
          updateRemoteStatus("⏹️ 已指示遠端停止");
          return;
        }
        stopLocalRecording();
      }
    });
  }

  // 封裝本地錄音啟動邏輯，方便重用
  function startLocalRecording() {
     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
     if (!SR) {
       appendTranscript("❌ 本地語音辨識不可用，請使用支援的瀏覽器。");
       return;
     }
     const deviceId = micSelect && micSelect.value ? micSelect.value : undefined;
     
     recordBtn.dataset.state = "recording";
     recordBtn.textContent = "停止錄音";
     isRecording = true;
     recordingStartTs = performance.now();
     lastPhraseEndSec = 0;
     interimBuffer = ""; lastCommittedText = ""; lastCommittedNorm = "";
     interimLastCommitMs = performance.now();
     updateLatest("");
     
     try {
         sr = new SR();
         sr.lang = "zh-TW";
         sr.continuous = true;
         sr.interimResults = true;
         sr.onresult = (e) => {
           lastSrResultTs = Date.now();
           hasSrResultSinceStart = true;
           updateActivityTime();
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
                   hasSrResultSinceStart = false; 
                   srSessionStartTs = Date.now(); 
                   sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
                 } catch (e) { console.error("Local SR start failed", e); }
               }
             }, 500);
           }
         };
         
         hasSrResultSinceStart = false; 
         srSessionStartTs = Date.now(); 
         sr.start(); srActive = true; startSrKeepAlive(); startSilenceMonitor(deviceId); 
     } catch (e) { console.error("Local SR start failed", e); }
  }

  function stopLocalRecording() {
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
      stopAutoRestartTimer();
      console.log("✅ 錄音已停止");
  }

  function initCanvas() {
    pdfContainer.innerHTML = "";
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
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
    } catch (err) { console.error("PDF Fail", err); }
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || !canvas || !ctx) return;
    if (renderTask) try { renderTask.cancel(); } catch (e) {}
    
    const page = await pdfDoc.getPage(pageNum);
    const viewportRaw = page.getViewport({ scale: 1 });
    
    const containerWidth = pdfContainer.clientWidth;
    const containerHeight = pdfContainer.clientHeight;
    
    if (containerWidth === 0 || containerHeight === 0) return; 

    const scale = Math.min(
      containerWidth / viewportRaw.width,
      containerHeight / viewportRaw.height
    );
    const viewport = page.getViewport({ scale });

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);

    const renderContext = { canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null };
    try { renderTask = page.render(renderContext); await renderTask.promise; renderTask = null; }
    catch (err) { if (err.name !== 'RenderingCancelledException') console.error("Render Fail", err); renderTask = null; }
  }

  function showSlide(idx) {
    if (pdfFiles[idx]) {
      currentIdx = idx; loadPDF(pdfFiles[idx]);
      if (pdfSelect) pdfSelect.value = String(idx);
    }
  }

  // 初始化
  try { await initPdfDB(); await loadStoredPdfs(pdfFiles, pdfSelect); } catch (e) {}
  showSlide(0);
  setupRecordingControls();
  if (pdfSelect) pdfSelect.addEventListener("change", () => showSlide(parseInt(pdfSelect.value, 10)));
  
  function goToPage(target) {
    if (!pdfDoc) return;
    const clamped = Math.min(Math.max(target, 1), pdfDoc.numPages);
    if (clamped !== currentPage) { currentPage = clamped; renderPage(currentPage); syncSlider(); }
  }

  if (pageSlider) pageSlider.addEventListener("input", () => goToPage(parseInt(pageSlider.value, 10)));
  if (pageArrowUp) pageArrowUp.addEventListener("click", () => goToPage(currentPage - 1));
  if (pageArrowDown) pageArrowDown.addEventListener("click", () => goToPage(currentPage + 1));
  
  if (pdfContainer) pdfContainer.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!pdfDoc || wheelLock) return;
    wheelLock = true;
    const next = currentPage + (e.deltaY > 0 ? 1 : -1);
    goToPage(next);
    setTimeout(() => { wheelLock = false; }, 200);
  }, { passive: false });

  window.addEventListener("resize", () => { clearTimeout(window.__pdfResizeTimer); window.__pdfResizeTimer = setTimeout(() => renderPage(currentPage), 200); });
  document.addEventListener('fullscreenchange', () => setTimeout(() => renderPage(currentPage), 200));

  initDummyData();
});