!include "LogicLib.nsh"

!macro customInstall
  DetailPrint "Configuring Package Guardian CLI in System PATH..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\cli\path-manager.ps1" -Action install -Dir "$INSTDIR\cli"'

  ; Manage installation identity: distinguish fresh install vs upgrade
  ${If} ${FileExists} "$INSTDIR\install.ini"
    ; Normal upgrade: retain existing installation ID, update version
    WriteINIStr "$INSTDIR\install.ini" "Install" "Version" "${VERSION}"
    WriteINIStr "$INSTDIR\install.ini" "Install" "IsUpgrade" "1"
    WriteINIStr "$INSTDIR\install.ini" "Install" "UpdatedDate" "${__DATE__} ${__TIME__}"
  ${Else}
    ; Fresh install or clean reinstall: check if legacy install.ini can be migrated first
    StrCpy $0 ""
    ${If} ${FileExists} "$APPDATA\PackageGuardian\install.ini"
      ReadINIStr $0 "$APPDATA\PackageGuardian\install.ini" "Install" "InstallationId"
    ${ElseIf} ${FileExists} "$APPDATA\PackageGuard\install.ini"
      ReadINIStr $0 "$APPDATA\PackageGuard\install.ini" "Install" "InstallationId"
    ${EndIf}

    ${If} $0 == ""
      nsExec::ExecToStack 'powershell.exe -NoProfile -Command "[guid]::NewGuid().ToString()"'
      Pop $1 ; exit code
      Pop $2 ; GUID string
      ${If} $1 == 0
        StrCpy $0 $2
      ${EndIf}
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
  CreateDirectory "$APPDATA\PackageGuardian"
  WriteINIStr "$APPDATA\PackageGuardian\install.ini" "Install" "InstallationId" "$0"
  WriteINIStr "$APPDATA\PackageGuardian\install.ini" "Install" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  DetailPrint "Removing Package Guardian CLI from System PATH..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\cli\path-manager.ps1" -Action uninstall -Dir "$INSTDIR\cli"'

  DetailPrint "Resetting installation permissions and registry..."
  DeleteRegKey HKCU "Software\Package Guardian"
  DeleteRegKey HKCU "Software\PackageGuardian"
  DeleteRegKey HKCU "Software\Classes\package-guardian"
  DeleteRegKey HKCU "Software\Package Guard"
  DeleteRegKey HKCU "Software\PackageGuard"
  DeleteRegKey HKCU "Software\Classes\package-guard"

  DetailPrint "Cleaning temporary updater artifacts (user data preserved)..."
  RMDir /r "$LOCALAPPDATA\package-guardian-updater"
  RMDir /r "$LOCALAPPDATA\PackageGuardian-updater"
  RMDir /r "$LOCALAPPDATA\Package Guardian-updater"
  RMDir /r "$LOCALAPPDATA\package-guard-updater"
  RMDir /r "$LOCALAPPDATA\PackageGuard-updater"
  RMDir /r "$LOCALAPPDATA\Package Guard-updater"
  Delete "$INSTDIR\install.ini"
!macroend
