# 本機語音轉文字

此目錄保留選用本機轉寫後端；AI空間助理已移除本機語音輸入按鈕，即時語音由Gemini Live提供。選用本機轉寫後端使用 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) Windows x64 命令列程式，以 CPU 兩執行緒處理，每段最長 30 秒。它不讀取 Gemini 金鑰，也不向語音服務上傳錄音。安裝版會將程式與模型放入應用程式資源目錄。

- 二進位來源：[whisper.cpp nightly b5130](https://github.com/ggml-org/whisper.cpp/releases/tag/b5130)，ZIP SHA-256：`F9EC6C52A2E949B62AB51FA21D0D497958F9E41C3010C157C4E42932D5316F3C`。
- 多語言量化模型：[ggml-tiny-q5_1.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin)，SHA-1：`2827A03E495B1ED3048EF28A6A4620537DB4EE51`。
- 程式授權：隨附 `LICENSE`（MIT）。模型的使用條款以來源頁為準。

小型模型較省 RAM，但繁體中文辨識精度會因口音與雜音而異；傳送前可在對話框編輯文字。
