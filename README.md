# carb-calc

第 1 型糖尿病碳水/胰島素紀錄與 I:C 推算工具（個人用）。

> 本工具僅供個人記錄與輔助參考，不取代醫療專業判斷。任何劑量調整請與您的內分泌科醫師討論。

## 設計目標

- **使用者**：胰島素幫浦使用者（最小單位 0.1U）+ CGM 監測
- **核心功能**：
  - 單餐 carb + GI 計算
  - 用餐 + 胰島素 + CGM 日誌
  - 「常吃餐記憶」：同道菜累積紀錄 → 推算最佳劑量
  - 照片相似度比對（pHash）自動歸類同道菜

## 技術

- 純 HTML / CSS / Vanilla JS PWA（無框架）
- Service Worker 離線快取
- 設計給 GitHub Pages 部署

## 開發狀態

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | 規劃 | ✅ |
| 1 | 食材庫資料（TFDA + GI） | ✅ |
| 2 | PWA 框架（4 tab 殼、暗色、響應式） | ✅ 目前 |
| 3 | 計算器（功能 A） | ⏳ |
| 4 | 紀錄（功能 B 上半） | ⏳ |
| 5 | 推算 I:C + 趨勢圖 | ⏳ |
| 6 | Gist 同步 | ⏳ |
| 7 | 部署 + 測試 | ⏳ |

## 本機跑

任意 HTTP 伺服器即可（Service Worker 不能在 `file://` 下執行）：

```sh
cd carb-calc
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

## 配置

設定頁第一次開啟時會自動填妥內建的雲端照片儲存設定，可在設定頁修改或恢復預設。

## 資料來源

- TFDA 台灣食品營養成分資料庫
- University of Sydney GI Database
- 衛福部 GI 表 / Glycemic Index Foundation
- 主食熟食版本與部分 GI 為手動補充估計值（標 `gi_confirmed: false`）

詳見 `_食材庫對照表.md`。

## License

私人專案，未開放授權。
