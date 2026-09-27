
!macro NSIS_HOOK_POSTINSTALL
  ; Tauri/NSIS manages standard shortcuts; this explicit desktop shortcut keeps
  ; the requested behavior deterministic for the Taiwan desktop build.
  CreateShortCut "$DESKTOP\上帝之眼・台灣版.lnk" "$INSTDIR\gods-eye-taiwan.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\上帝之眼・台灣版.lnk"
!macroend
