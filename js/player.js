document.addEventListener("DOMContentLoaded", () => {
  // 建立廣播頻道用於跨頁面同步
  const syncChannel = new BroadcastChannel('video-sync');
  let syncInterval = null;
  
  // 接收來自學生端的同步請求
  // 保存原始的 onmessage 處理器（如果存在）
  const originalOnMessage = syncChannel.onmessage;
  
  syncChannel.onmessage = (event) => {
    // 處理同步請求
    if (event.data && event.data.type === 'requestSyncFromStudent') {
      console.log("👥 收到學生端同步請求");
      handleWebSocketRequestSync();
    }
    
    // 調用原始的 onmessage 處理器（如果存在）
    if (typeof originalOnMessage === 'function') {
      originalOnMessage.call(syncChannel, event);
    }
  };

  // 初始加載完成後立即發送一次時間同步信息
  setTimeout(() => {
    if (videoElement) {
      syncChannel.postMessage({
        type: 'syncTime',
        time: Math.floor(videoElement.currentTime),
        isPlaying: !videoElement.paused
      });
    }
  }, 100);

  // 如果需要，這裡可以添加WebSocket伺服器支援，處理來自index.html的同步請求
  // 注意：這部分需要對應的後端WebSocket伺服器實現
  function handleWebSocketRequestSync() {
    // 立即發送當前視頻時間和播放狀態
    if (videoElement) {
      // 如果有WebSocket連接（如果player.js也使用WebSocket），可以在這裡發送
      // 這裡主要依賴BroadcastChannel的機制
      
      // 獲取當前正在播放的視頻源
      const sourceElement = videoElement.querySelector('source');
      if (sourceElement && sourceElement.src) {
        // 從src中提取視頻文件名（如 video3.mp4）
        const srcParts = sourceElement.src.split('/');
        const videoSrc = srcParts[srcParts.length - 1];
        
        // 計算對應的字幕文件名 - 改進版本，適用於各種視頻格式
        const baseName = videoSrc.substring(0, videoSrc.lastIndexOf('.')) || videoSrc;
        const subtitleFileName = `assets/subtitles/${baseName}_subtitles.json`;
        
        console.log(`📤 發送影片同步信息: 影片=${videoSrc}, 字幕=${subtitleFileName}, 時間=${Math.floor(videoElement.currentTime)}秒, 播放狀態=${!videoElement.paused}`);
        
        // 首先發送switchVideo消息，確保index.html加載正確的字幕文件
        syncChannel.postMessage({
          type: 'switchVideo',
          subtitleFileName: subtitleFileName,
          videoSrc: videoSrc
        });
        
        // 然後發送syncTime消息，同步時間和播放狀態
        setTimeout(() => {
          syncChannel.postMessage({
            type: 'syncTime',
            time: Math.floor(videoElement.currentTime),
            isPlaying: !videoElement.paused
          });
        }, 100);
      } else {
        // 如果沒有找到source元素，至少發送時間同步信息
        console.log(`📤 發送時間同步信息: 時間=${Math.floor(videoElement.currentTime)}秒, 播放狀態=${!videoElement.paused}`);
        syncChannel.postMessage({
          type: 'syncTime',
          time: Math.floor(videoElement.currentTime),
          isPlaying: !videoElement.paused
        });
      }
    }
  }
  
  // 定期發送同步資訊，確保新加入的頁面可以及時獲取最新狀態
  setInterval(() => {
    if (videoElement) {
      syncChannel.postMessage({
        type: 'syncTime',
        time: Math.floor(videoElement.currentTime),
        isPlaying: !videoElement.paused
      });
    }
  }, 5000); // 每5秒發送一次

  // 即時語音字幕同步
  function syncLiveTranscription(text) {
    const liveTranscriptionVideo = document.getElementById('liveTranscription_video');
    const liveTranscriptionPresentation = document.getElementById('liveTranscription_presentation');
    if (liveTranscriptionVideo) liveTranscriptionVideo.innerHTML = text;
    if (liveTranscriptionPresentation) liveTranscriptionPresentation.innerHTML = text;
  }

  // 範例：偵測語音轉錄事件（你可用自己的語音API觸發）
  window.addEventListener('liveTranscriptionUpdate', (e) => {
    syncLiveTranscription(e.detail);
  });

  // 發送視頻時間同步資訊 - 始終發送，確保用戶隨時進入都能同步
  function sendSyncTime() {
    if (videoElement) {
      syncChannel.postMessage({
        type: 'syncTime',
        time: Math.floor(videoElement.currentTime),
        isPlaying: !videoElement.paused // 包含播放狀態信息
      });
    }
  }

  // 開始同步時間
  function startSyncInterval() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(sendSyncTime, 1000);
  }

  // 停止同步時間
  function stopSyncInterval() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }
  const videoElement = document.getElementById("mainVideo");
  const videoListItems = document.querySelectorAll(".video-list li");
  const videoModeBtn = document.getElementById("videoModeBtn");
  const presentationModeBtn = document.getElementById("presentationModeBtn");
  const videoPlayer = document.querySelector(".video-player");
  const presentationPanel = document.querySelector(".presentation-panel");
  const videoListBlock = document.getElementById("videoListBlock");
  const presentationListBlock = document.getElementById("presentationListBlock");
  const subtitlePanel = document.querySelector(".subtitle-panel");
  const presentationSubtitlePanel = document.querySelector(".presentation-subtitle-panel");

  // 初始只顯示影片模式與影片清單，右側字幕區顯示
  videoPlayer.style.display = "block";
  presentationPanel.style.display = "none";
  videoListBlock.style.display = "block";
  presentationListBlock.style.display = "none";
  if (subtitlePanel) subtitlePanel.style.display = "block";
  if (presentationSubtitlePanel) presentationSubtitlePanel.style.display = "none";

  // 切換到影片模式
  videoModeBtn.addEventListener("click", () => {
    videoPlayer.style.display = "block";
    presentationPanel.style.display = "none";
    videoListBlock.style.display = "block";
    presentationListBlock.style.display = "none";
    if (subtitlePanel) subtitlePanel.style.display = "block";
    if (presentationSubtitlePanel) presentationSubtitlePanel.style.display = "none";
    videoModeBtn.classList.add("active");
    presentationModeBtn.classList.remove("active");
  });

  // 切換到簡報模式
  presentationModeBtn.addEventListener("click", () => {
    videoPlayer.style.display = "none";
    presentationPanel.style.display = "block";
    videoListBlock.style.display = "none";
    presentationListBlock.style.display = "block";
    if (subtitlePanel) subtitlePanel.style.display = "none";
    if (presentationSubtitlePanel) presentationSubtitlePanel.style.display = "flex";
    // 切換到簡報模式時自動暫停影片
    if (videoElement && !videoElement.paused) {
      videoElement.pause();
    }
    presentationModeBtn.classList.add("active");
    videoModeBtn.classList.remove("active");
  });

  videoListItems.forEach((item) => {
    item.addEventListener("click", () => {
      const videoSrc = item.getAttribute("data-video");
      const fullPath = `assets/videos/${videoSrc}`;

      // 替換影片來源
      videoElement.querySelector("source").src = fullPath;
      videoElement.load();
      videoElement.play();

      console.log("🎞️ 已切換影片為:", videoSrc);

      // 發送影片切換通知到BroadcastChannel
      const subtitleFileName = `assets/subtitles/${videoSrc.replace('.mp4', '_subtitles.json')}`;
      syncChannel.postMessage({
        type: 'switchVideo',
        subtitleFileName: subtitleFileName,
        videoSrc: videoSrc
      });

      // 發送通知：影片已切換（給 subtitles.js 用）
      const event = new CustomEvent("videoChanged", { detail: videoSrc });
      window.dispatchEvent(event);
    });
  });

  // 視頻播放事件 - 開始同步時間
  videoElement.addEventListener('play', () => {
    startSyncInterval();
    syncChannel.postMessage({ type: 'play' });
    console.log('🎥 影片開始播放，開始同步字幕');
  });

  // 視頻暫停事件 - 停止同步時間
  videoElement.addEventListener('pause', () => {
    stopSyncInterval();
    syncChannel.postMessage({ type: 'pause' });
    console.log('⏸️ 影片暫停，停止同步字幕');
  });

  // 視頻結束事件 - 停止同步時間
  videoElement.addEventListener('ended', () => {
    stopSyncInterval();
    syncChannel.postMessage({ type: 'pause' });
    console.log('🔚 影片播放結束');
  });

  // 視頻時間更新事件 - 即時同步
  videoElement.addEventListener('timeupdate', () => {
    // 每秒同步一次已足夠，避免過度頻繁發送消息
    sendSyncTime();
  });
});
