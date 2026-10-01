# 桌面程式遭防毒攔截：查核紀錄

2026-09-29 16:41 與 16:42，啟動器記錄 `gods-eye-taiwan.exe` 不存在。當時程式先前已成功編譯；這是啟動器的檔案存在檢查失敗，不是程式本身回報病毒名稱。

本機偵測到 Windows Defender 及 Trend Micro Apex One。Defender 的 `Get-MpThreatDetection` 沒有相應紀錄；Apex One `SUSPECT` 目錄有一筆 16:33 建立、大小 19,585,396 bytes 的檔案，與當次程式大小接近。這些是隔離的線索，尚不足以確認偵測名稱、處置方式，亦不能據此認定是誤判。

17:20 重新編譯的 `gods-eye-taiwan.exe` 大小 19,585,024 bytes，SHA-256：

`7A05D49D0C7E13EE9093C1E7273405C802D66D63C82929696512E3E21C19DD4B`

重新啟動後，桌面視窗曾顯示「上帝之眼・台灣版」且 Windows 回報可回應。此檔沒有數位簽章。若 EXE 再次消失，請由有權限的資訊管理員檢查 Apex One 的病毒／惡意程式紀錄或中央隔離紀錄，核對檔名、SHA-256、偵測名稱與處置時間，再決定是否向 Trend Micro 送交誤判分析。未查明前不應停用防護或逕行還原隔離檔案。

參考：[Apex One 隔離檔案還原說明](https://docs.trendmicro.com/en-us/documentation/article/trend-micro-apex-one-service-pack-1-online-help-restoring-quarantine_001)。

## 2026-09-30 追查結果

08:09:30 啟動紀錄顯示桌面程式曾成功啟動；目前該 EXE 已不存在。Apex One 本機紀錄 `C:\Program Files (x86)\Trend Micro\Security Agent\report\20260930.log` 明確記載：

- 偵測名稱：`Troj.Win32.TRX.XXPE50FFF109`
- 目標：`D:\CODEX用\上帝之眼台灣版\gods-eye-taiwan-desktop\.work\upstream\src-tauri\target\debug\gods-eye-taiwan.exe`
- 清理時間：08:09:40–08:09:54
- 結果：`delete process ... success`、`delete file ... success`、`Virus found count(1)`、`Virus clean count(1)`
- Apex One `Backup` 與 `SUSPECT` 目錄在 08:09:54–55 均新增同名 `TSC_GENCLEAN_2026_09_30_08_09_45_874_035.DAT` 檔案。此為處置線索，不能直接視為可安全還原的執行檔。

前一天的 `report\20260929.log` 也記載相同偵測名稱與同一 EXE 路徑，表示重建後再次發生。現有紀錄證實 Apex One 已對此程式採取清理動作，但無法證明該偵測為真陽性或誤判。暫停重新編譯、執行或將路徑加入防毒排除清單；請資訊管理員在 Apex One 的病毒／惡意程式紀錄核對完整事件與檔案雜湊，依 [Trend Micro 的疑似誤判提報流程](https://success.trendmicro.com/en-US/solution/KA-0006659)送交分析。待廠商或資訊管理員確認檔案安全後，再決定是否恢復與重建。
