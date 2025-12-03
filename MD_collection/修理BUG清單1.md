# 修理BUG清單1 — 即時轉錄單字落盤與SR重啟8秒

## 背景
- 觀察到即時轉錄在輸出時，常出現「只輸出一個字就落盤」的情況，影響閱讀與字幕品質。
- SR 保活重啟設定為 4 秒導致過於頻繁的重啟，影響穩定性。

## 修理目標
- 修正即時轉錄的提交邏輯，避免單字就落盤。
- 將 SR 保活重啟門檻延長為 8 秒，減少重啟頻率。

## 變更項目
- [x] 新增 `MIN_FINAL_COMMIT_CHARS = 2`：最終提交至少 2 字才落盤（除非句末標點）。
- [x] 在 `appendTranscript(text)` 開頭加入最小字數檢查，對長度 < 2 且無句末標點的內容只更新 `latest`，不落盤。
- [x] 在 `sr.onend` 與靜音提交（`startSilenceMonitor`）處提交殘留 `latestText` 前加上最小字數門檻。
- [x] 將 `SR_KEEPALIVE_QUIET_MS` 調整為 `8000`（8 秒）；保留 `SR_KEEPALIVE_CHECK_MS = 1000`；冷卻 `MIN_SR_RESTART_INTERVAL_MS = 2000`。
- [x] 日誌更新：`🧰 SR保活: 8秒無結果，觸發重啟`。

## 受影響檔案
- `js/presentation.js`
  - 常數：`MIN_FINAL_COMMIT_CHARS`、`SR_KEEPALIVE_QUIET_MS`、`SR_KEEPALIVE_CHECK_MS`、`MIN_SR_RESTART_INTERVAL_MS`
  - 函式：`appendTranscript()`、`startSrKeepAlive()`、`sr.onend`、`startSilenceMonitor()`

## 實作摘要
- 在 `appendTranscript()` 中提前過濾長度不足的文字：
  - 若 `trimmed.length < 2` 且不符 `INTERIM_COMMIT_PUNCT`，則 `updateLatest(trimmed)` 並 `return`。
- 所有殘留暫時文字的提交點（保活重啟、`sr.onend`、靜音監測）均加入最小字數門檻以避免單字落盤。
- SR 保活改為 8 秒靜默才重啟，並保留 2 秒冷卻避免密集重啟。

## 驗收標準
- 在 `teacher.html` 中觀察：
  - 即時輸出不再出現單字就落盤（仍可在 `latest` 區顯示）。
  - 當 8 秒無 SR 結果時，才會出現 `🧰 SR保活: 8秒無結果，觸發重啟` 並執行重啟。
  - 重啟間隔至少 2 秒，不會密集重啟。

## 測試建議
- 使用短語或單字（例如「嗯」、「好」）說話，確認不會落盤成一行字幕，但會顯示在 `latest`。
- 持續說完整句並加入標點（或停頓），觀察會正確落盤。
- 模擬無結果 8 秒：暫停說話，觀察保活日誌與重啟行為。