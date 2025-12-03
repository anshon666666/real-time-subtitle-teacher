// ====== 與 teacher 端同步機制（BroadcastChannel + WebSocket） ======
const syncChannel = new BroadcastChannel('video-sync');
let ws;
let userControlMode = false; // 用户是否手动控制模式
let hasReceivedInitialSync = false; // 是否已接收初始同步信息
let lastSyncTime = 0; // 上一次同步的時間
let currentVideoSrc = ''; // 當前影片來源

function handleSyncEvent(data) {
  console.log("📨 收到同步事件: ", data.type);
  
  // 影片切換事件始終處理
  if (data.type === 'switchVideo') {
    console.log(`🎞️ 影片切換事件 - 字幕文件: ${data.subtitleFileName}, 影片來源: ${data.videoSrc}`);
    
    // 切換字幕檔案
    loadSubtitles(data.subtitleFileName);
    currentTime = 0;
    subtitleRange.value = 0;
    updateSubtitle(0);
    
    if (isPlaying) {
      clearInterval(subtitleInterval);
      isPlaying = false;
      playPauseBtn.textContent = "播放";
    }
    
    // 切換影片時重置用戶控制模式和初始同步標誌
    userControlMode = false;
    hasReceivedInitialSync = false;
    currentVideoSrc = data.videoSrc || '';
    console.log(`🎯 已切換至影片: ${currentVideoSrc || '未知'}`);
    
    // 確保控件已啟用
    if (subtitleRange.disabled) {
      subtitleRange.disabled = false;
      console.log("🔓 啟用字幕拉軸控件");
    }
    if (playPauseBtn.disabled) {
      playPauseBtn.disabled = false;
      console.log("🔓 啟用播放/暫停按鈕");
    }
  }
  
  // 處理同步時間事件
  if (data.type === 'syncTime') {
    console.log(`⏱️ 時間同步事件 - 時間: ${data.time}秒, 播放狀態: ${data.isPlaying ? '播放中' : '暫停'}`);
    
    // 記錄同步時間，用於判斷是否需要更新
    lastSyncTime = data.time;
    
    // 記錄已接收初始同步信息
    if (!hasReceivedInitialSync) {
      hasReceivedInitialSync = true;
      console.log("🎉 已接收初始同步信息");
      
      // 初始同步：不論用戶控制模式如何，立即更新時間
      currentTime = data.time;
      subtitleRange.value = currentTime;
      console.log(`🚀 初始同步完成，時間: ${data.time}秒`);
      updateSubtitle(currentTime);
      
      // 啟用控件
      subtitleRange.disabled = false;
      playPauseBtn.disabled = false;
      console.log("🔓 啟用所有控件");
      
      // 如果teacher端正在播放，這裡也自動播放
      if (data.isPlaying && !isPlaying) {
        console.log("▶️ 初始同步：teacher正在播放，自動開始播放");
        togglePlayPauseByTeacher();
      }
    } else if (!userControlMode) {
      // 如果用戶沒有手動控制，完全跟隨teacher的狀態
      currentTime = data.time;
      subtitleRange.value = currentTime;
      updateSubtitle(currentTime);
      console.log(`🔄 跟隨teacher時間: ${data.time}秒`);
      
      // 根據teacher的播放狀態調整本地播放狀態
      if (data.isPlaying && !isPlaying) {
        console.log("▶️ teacher開始播放，跟隨播放");
        togglePlayPauseByTeacher();
      } else if (!data.isPlaying && isPlaying) {
        console.log("⏸️ teacher暫停播放，跟隨暫停");
        togglePlayPauseByTeacher();
      }
    } else {
      console.log("👤 處於用戶控制模式，忽略同步更新");
    }
  }
  
  // 兼容性處理：仍然支持獨立的play和pause事件
  if (data.type === 'play' && !userControlMode) {
    console.log("▶️ 收到播放事件，跟隨播放");
    if (!isPlaying) {
      togglePlayPauseByTeacher();
    }
  }
  
  if (data.type === 'pause' && !userControlMode) {
    console.log("⏸️ 收到暫停事件，跟隨暫停");
    if (isPlaying) {
      togglePlayPauseByTeacher();
    }
  }
}

syncChannel.onmessage = (event) => {
  handleSyncEvent(event.data);
};

function setupWebSocket() {
  ws = new WebSocket('ws://localhost:8080'); // 依照伺服器實際位址調整
  ws.onopen = () => {
    console.log('WebSocket 已連線');
    // 連接成功後，請求最新的同步狀態
    try {
      ws.send(JSON.stringify({ type: 'requestSync' }));
    } catch (e) {
      console.error('發送同步請求失敗', e);
    }
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSyncEvent(data);
    } catch (e) {
      console.error('WebSocket 訊息解析失敗', e);
    }
  };
  ws.onclose = () => {
    console.warn('WebSocket 已斷線，嘗試重連...');
    setTimeout(setupWebSocket, 2000);
  };
}

setupWebSocket();
let currentSubtitles = [];
let displayedIndexes = [];
let currentTime = 0;  // 當前時間，用來同步字幕顯示
let isPlaying = false;
let subtitleInterval = null;
let maxTime = 100; // 字幕最大秒數
const subtitleContainer = document.getElementById("subtitleText");
const subtitleRange = document.getElementById("subtitleRange");
const playPauseBtn = document.getElementById("playPauseBtn");

// 播放與暫停切換 - 由用戶手動控制
function togglePlayPause() {
  // 設置為用戶控制模式
  userControlMode = true;
  
  if (isPlaying) {
    clearInterval(subtitleInterval); // 停止字幕更新
    playPauseBtn.textContent = "播放";
    console.log("⏸️ 用戶暫停播放");
  } else {
    subtitleInterval = setInterval(() => {
      currentTime += 1;
      if (currentTime > maxTime) {
        currentTime = maxTime;
        clearInterval(subtitleInterval);
        isPlaying = false;
        playPauseBtn.textContent = "播放";
        console.log("🔚 字幕播放結束");
      }
      subtitleRange.value = currentTime;
      updateSubtitle(currentTime);
    }, 1000);
    playPauseBtn.textContent = "暫停";
    console.log("▶️ 用戶開始播放");
  }
  isPlaying = !isPlaying;
}

// 播放與暫停切換 - 由teacher自動控制
function togglePlayPauseByTeacher() {
  // 注意：不設置userControlMode = true，因為這是自動同步行為
  
  if (isPlaying) {
    clearInterval(subtitleInterval); // 停止字幕更新
    playPauseBtn.textContent = "播放";
    console.log("⏸️ 由teacher暫停播放");
  } else {
    subtitleInterval = setInterval(() => {
      currentTime += 1;
      if (currentTime > maxTime) {
        currentTime = maxTime;
        clearInterval(subtitleInterval);
        isPlaying = false;
        playPauseBtn.textContent = "播放";
        console.log("🔚 字幕播放結束");
      }
      subtitleRange.value = currentTime;
      updateSubtitle(currentTime);
    }, 1000);
    playPauseBtn.textContent = "暫停";
    console.log("▶️ 由teacher開始播放");
  }
  isPlaying = !isPlaying;
}

// 設置字幕顯示進度
function updateSubtitle(currentTime) {
  // 清空字幕顯示區
  subtitleContainer.innerHTML = "";
  
  // 檢查是否有字幕數據
  if (!currentSubtitles || currentSubtitles.length === 0) {
    subtitleContainer.innerHTML = "📝 無字幕數據";
    return;
  }
  
  let hasDisplayedSubtitle = false;
  
  // 遍歷字幕
  currentSubtitles.forEach((line, index) => {
    const start = timeStrToSeconds(line.start);
    const end = timeStrToSeconds(line.end);

    // 顯示時間範圍內的字幕
    if (currentTime >= start) {
      const lineDiv = document.createElement("div");
      lineDiv.classList.add("subtitle-line");
      lineDiv.innerHTML = `<span class="time-stamp">[${line.start} - ${line.end}]</span> ${line.text}`;
      subtitleContainer.appendChild(lineDiv);
      hasDisplayedSubtitle = true;
    }
  });
  
  // 如果沒有顯示任何字幕，顯示提示
  if (!hasDisplayedSubtitle) {
    subtitleContainer.innerHTML = "⏳ 等待字幕顯示...";
  }
}

// 拉軸控制
subtitleRange.addEventListener("input", (e) => {
  // 設置為用戶控制模式
  userControlMode = true;
  
  currentTime = parseInt(e.target.value, 10);
  updateSubtitle(currentTime);
  if (isPlaying) {
    clearInterval(subtitleInterval);
    isPlaying = false;
    playPauseBtn.textContent = "播放";
    console.log("🎛️ 用戶拖動拉軸，停止自動播放");
  }
  console.log(`🎯 用戶手動定位至: ${currentTime}秒`);
});

// 載入字幕文件
function loadSubtitles(subtitleFileName) {
  console.log("📥 嘗試載入字幕文件：", subtitleFileName);
  fetch(subtitleFileName)
    .then((res) => {
      if (!res.ok) throw new Error(`字幕載入失敗：${res.status} ${res.statusText}`);
      return res.json();
    })
    .then((data) => {
      currentSubtitles = data;
      subtitleContainer.innerText = "";
      displayedIndexes = [];
      // 計算字幕最大秒數
      if (currentSubtitles.length > 0) {
        maxTime = Math.ceil(timeStrToSeconds(currentSubtitles[currentSubtitles.length - 1].end));
        subtitleRange.max = maxTime;
        console.log(`📊 字幕資訊 - 總數: ${currentSubtitles.length}, 最大時間: ${maxTime}秒`);
      } else {
        maxTime = 100;
        subtitleRange.max = 100;
      }
      console.log("✅ 載入字幕成功：", subtitleFileName);
      // 立即更新字幕顯示（如果已有時間信息）
      if (currentTime > 0) {
        updateSubtitle(currentTime);
      }
    })
    .catch((err) => {
      console.error("❌ 字幕載入失敗：", err);
      subtitleContainer.innerText = `⚠️ 無法載入字幕: ${subtitleFileName}`;
      currentSubtitles = [];
      displayedIndexes = [];
    });
}

// 初始載入字幕
window.addEventListener("load", () => {
  console.log("🚀 字幕播放器已初始化，等待同步信息...");
  
  // 不預設載入任何字幕文件，等待從teacher.html接收同步信息
  subtitleRange.value = 0;  // 預設拉軸為 0
  subtitleRange.disabled = true; // 在收到同步信息前禁用拉軸
  playPauseBtn.disabled = true; // 在收到同步信息前禁用播放/暫停按鈕
  subtitleContainer.innerText = "⏳ 等待同步信息...\n(正在連接教師端)";
  
  // 主動請求同步信息 - 添加多次重試機制
  const retryIntervals = [1000, 2000, 3000, 5000]; // 重試時間間隔
  let retryIndex = 0;
  
  function requestSync() {
    try {
      // 使用 BroadcastChannel 請求同步
      syncChannel.postMessage({ type: 'requestSyncFromStudent' });
      console.log(`📡 已發送同步請求 #${retryIndex + 1}`);
      
      // 防止請求未收到回應的情況，添加超時重試
      if (!hasReceivedInitialSync && retryIndex < retryIntervals.length) {
        setTimeout(() => {
          if (!hasReceivedInitialSync) {
            retryIndex++;
            console.log(`🔄 同步請求超時，${retryIntervals[retryIndex - 1]}毫秒後重新發送`);
            requestSync();
          }
        }, retryIntervals[retryIndex]);
      }
      
      // 如果多次重試後仍未收到同步信息，提供備用方案
      if (retryIndex === retryIntervals.length) {
        setTimeout(() => {
          if (!hasReceivedInitialSync) {
            console.warn("⚠️ 多次同步請求失敗，正在載入默認字幕文件");
            subtitleContainer.innerText = "⚠️ 無法連接到教師端\n正在載入默認字幕...";
            
            // 嘗試載入默認字幕文件作為備用方案
            loadSubtitles('assets/subtitles/video1_subtitles.json');
            subtitleRange.disabled = false;
            playPauseBtn.disabled = false;
          }
        }, 1000);
      }
    } catch (e) {
      console.error("❌ 發送同步請求失敗", e);
      subtitleContainer.innerText = `⚠️ 同步請求出現錯誤:\n${e.message}`;
    }
  }
  
  // 開始第一次同步請求
  requestSync();
});

// 定期檢查是否需要自動退出用戶控制模式
// 如果用戶一段時間沒有操作，可以自動回復同步
setInterval(() => {
  if (userControlMode && !isPlaying) {
    // 例如：用戶30秒沒有操作，可以考慮自動退出控制模式
    // 這部分可以根據需求調整時間間隔
    // userControlMode = false;
    // console.log("🔄 自動退出用戶控制模式，恢復同步");
  }
}, 30000); // 30秒檢查一次

// 連接播放/暫停按鈕
playPauseBtn.addEventListener("click", togglePlayPause);

// 將時間字串轉換為秒
function timeStrToSeconds(timeStr) {
  const [hh, mm, ssms] = timeStr.split(":");
  const [ss, ms] = ssms.split(".");
  return (
    parseInt(hh) * 3600 +
    parseInt(mm) * 60 +
    parseInt(ss) +
    (ms ? parseInt(ms) / 1000 : 0)
  );
}
