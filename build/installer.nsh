!include "LogicLib.nsh"

!macro customInstall
  DetailPrint "Configuring Package Guard CLI in System PATH..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\cli\path-manager.ps1" -Action install -Dir "$INSTDIR\cli"'

  ; Manage installation identity: distinguish fresh install vs upgrade
  ${If} ${FileExists} "$INSTDIR\install.ini"
    ; Normal upgrade: retain existing installation ID, update version
    WriteINIStr "$INSTDIR\install.ini" "Install" "Version" "${VERSION}"
    WriteINIStr "$INSTDIR\install.ini" "Install" "IsUpgrade" "1"
    WriteINIStr "$INSTDIR\install.ini" "Install" "UpdatedDate" "${__DATE__} ${__TIME__}"
  ${Else}
    ; Fresh install or clean reinstall: generate new unique installation identity
    StrCpy $0 ""
    nsExec::ExecToStack 'powershell.exe -NoProfile -Command "[guid]::NewGuid().ToString()"'
    Pop $1 ; exit code
    Pop $2 ; GUID string
    ${If} $1 == 0
      StrCpy $0 $2
    ${EndIf}
    ${If} $0 == ""
      StrCpy $0 "${__DATE__}-${__TIME__}-$R0"
    ${EndIf}
    WriteINIStr "$INSTDIR\install.ini" "Install" "InstallationId" "$0"
    WriteINIStr "$INSTDIR\install.ini" "Install" "Version" "${VERSION}"
    WriteINIStr "$INSTDIR\install.ini" "Install" "InstallDate" "${__DATE__} ${__TIME__}"
  ${EndIf}

  ; Mirror installation ID to AppData for detection
  ReadINIStr $0 "$INSTDIR\install.ini" "Install" "InstallationId"
  CreateDirectory "$APPDATA\PackageGuard"
  WriteINIStr "$APPDATA\PackageGuard\install.ini" "Install" "InstallationId" "$0"
  WriteINIStr "$APPDATA\PackageGuard\install.ini" "Install" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  DetailPrint "Removing Package Guard CLI from System PATH..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\cli\path-manager.ps1" -Action uninstall -Dir "$INSTDIR\cli"'

  ; Cleanly reset installation-specific permission state on uninstall
  DetailPrint "Resetting installation permissions..."
  Delete "$APPDATA\PackageGuard\config\permissions.json"
  Delete "$APPDATA\PackageGuard\config\.first_launch_done"
  Delete "$APPDATA\PackageGuard\config\.install_id"
  Delete "$APPDATA\PackageGuard\install.ini"
  Delete "$LOCALAPPDATA\Package Guard\config\permissions.json"
  Delete "$LOCALAPPDATA\Package Guard\config\.first_launch_done"
  DeleteRegKey HKCU "Software\Package Guard"
  DeleteRegKey HKCU "Software\PackageGuard"

  ; Clean Electron Chromium cache so reinstall doesn't run stale cached bytecode
  DetailPrint "Cleaning Electron application cache..."
  RMDir /r "$APPDATA\Package Guard\Cache"
  RMDir /r "$APPDATA\Package Guard\Code Cache"
  RMDir /r "$APPDATA\Package Guard\DawnGraphiteCache"
  RMDir /r "$APPDATA\Package Guard\DawnWebGPUCache"
  RMDir /r "$APPDATA\Package Guard\GPUCache"
  RMDir /r "$APPDATA\Package Guard\blob_storage"
  RMDir /r "$APPDATA\Package Guard\Session Storage"
  RMDir /r "$APPDATA\Package Guard\data"
  RMDir /r "$APPDATA\PackageGuard\temp"
  RMDir /r "$APPDATA\PackageGuard\cache"
  RMDir /r "$APPDATA\package-guard"
  RMDir /r "$LOCALAPPDATA\package-guard-updater"

  ; DATA PRESERVATION:
  ; User-owned project data in $APPDATA\PackageGuard\data, $LOCALAPPDATA\Package Guard\data,
  ; and snapshots are preserved unless clean reset is selected.
!macroend
