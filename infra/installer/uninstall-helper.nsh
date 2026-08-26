; ─────────────────────────────────────────────────────────────────────────────
; Project Guardian — Custom NSIS Helper
; ─────────────────────────────────────────────────────────────────────────────
;
; Included by electron-builder via nsis.include in electron-builder.config.js.
;
; Only the two macros electron-builder calls are defined here:
;   !macro customInstall   — runs after standard install steps
;   !macro customUninstall — runs before standard uninstall steps
;
; The custom uninstall-choice page has been removed because electron-builder
; compiles the installer and uninstaller in two separate NSIS passes.
; Defining un.* functions in an include file causes warning 6020 in the
; installer pass (treated as error). Instead, customUninstall shows a
; MessageBox to ask the user and acts on the response directly.
; ─────────────────────────────────────────────────────────────────────────────

!include "LogicLib.nsh"

; ── Constants ──────────────────────────────────────────────────────────────────
!define APP_NAME        "Project Guardian"
!define APP_DATA_SUBDIR "Project Guardian"
!define UNINSTALL_REG   "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

; ── Macro: customInstall ──────────────────────────────────────────────────────
; Writes extra registry values and a sentinel ini file to AppData.

!macro customInstall
  WriteRegStr HKLM "${UNINSTALL_REG}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_REG}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_REG}" "Publisher"       "Lupus Venture"
  WriteRegStr HKLM "${UNINSTALL_REG}" "URLInfoAbout"    "https://github.com/lupusventure"
  WriteRegDWORD HKLM "${UNINSTALL_REG}" "NoModify"      1
  WriteRegDWORD HKLM "${UNINSTALL_REG}" "NoRepair"      0

  CreateDirectory "$APPDATA\${APP_DATA_SUBDIR}"
  WriteINIStr "$APPDATA\${APP_DATA_SUBDIR}\install.ini" "Install" "InstallDir" "$INSTDIR"
  WriteINIStr "$APPDATA\${APP_DATA_SUBDIR}\install.ini" "Install" "Version"    "${VERSION}"
!macroend

; ── Macro: customUninstall ────────────────────────────────────────────────────
; Asks the user whether to also delete AppData, then acts accordingly.

!macro customUninstall
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 \
    "Do you also want to delete all ${APP_NAME} data and settings stored in AppData?$\n$\nClick Yes to remove everything, or No to keep your data." \
    IDYES doFullWipe IDNO doAppOnly

  doFullWipe:
    Sleep 1000
    RMDir /r "$APPDATA\${APP_DATA_SUBDIR}"
    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"
    DeleteRegKey HKCU "${UNINSTALL_REG}"
    DeleteRegKey HKLM "${UNINSTALL_REG}"
    Goto uninstallDone

  doAppOnly:
    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"
    DeleteRegValue HKCU "${UNINSTALL_REG}" "UninstallChoice"
    Goto uninstallDone

  uninstallDone:
!macroend
