# 去識別化開源工具

本資料夾收錄 [Dean Lin 的 data-deidentification](https://github.com/dean9703111/data-deidentification) 專案，供文件個資遮罩與去識別化使用。

- **原始作者**：Dean Lin (GitHub: dean9703111)
- **原始專案**：https://github.com/dean9703111/data-deidentification
- **原作者線上版**：https://deanlin.net/data-deidentification/
- **影片介紹**：https://youtu.be/Mx7d0nSF61k?si=H4T6W59ZNNS0X08y
- **授權**：MIT，轉載及修改須保留原始 LICENSE 與版權資訊。

## 功能
可於瀏覽器內處理 PDF、Word、Excel、TXT、Markdown，辨識敏感個資、人工覆核、遮罩並輸出，視模式提供 CSV 編碼表還原。完整限制以原始專案說明為準。

## 安全須知
本專案尚未經獨立的完整惡意程式掃描或個資滲透測試；原作者稱文件僅在本機瀏覽器處理，但不應直接認定所有情況下皆無資料外洩風險。初次使用請以虛構測試文件驗證；正式文件需人工複核所有遮罩結果，且編碼對照表本身亦屬敏感資料。

## 收錄原則
僅收錄網站運作所需之源碼、靜態素材、依賴設定和 LICENSE；排除 .claude、.specify、.playwright-mcp、scripts、tests、examples、specs 及原開發者的 GitHub Actions，以降低複製不必要指令與測試內容的風險。

## 部署
本資料夾由安全收錄作業同步程式碼。GitHub Pages 需由儲存庫設定發佈來源及相容的部署流程，尚未驗證前不宣稱已上線。
