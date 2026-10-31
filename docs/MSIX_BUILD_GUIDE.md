# Package Guardian — Windows MSIX Build & Microsoft Store Deployment Guide

This document is the authoritative guide for building, signing, validating, and submitting the **Package Guardian** MSIX package to the **Microsoft Store**, while preserving the existing NSIS EXE installer workflow.

---

## 1. Architecture & Packaging Overview

Package Guard is an Electron-based desktop application with an integrated CLI engine (`pg`), local JSON/database storage, and native Windows integrations.

| Component | NSIS Installer (`.exe`) | Microsoft Store Package (`.msix`) |
| :--- | :--- | :--- |
| **Output File** | `release/PackageGuardian-Setup.exe` | `release/PackageGuardian-1.0.0-x64.msix` |
| **Install Target** | `%LOCALAPPDATA%\Programs\Package Guardian` or `C:\Program Files` | `C:\Program Files\WindowsApps\<PackageFamilyName>` (read-only container) |
| **Data Storage** | `%APPDATA%\PackageGuardian` (migrated from legacy `%APPDATA%\PackageGuard`) | Virtualized to `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalCache\Roaming\PackageGuardian` |
| **CLI Shim** | `%LOCALAPPDATA%\Microsoft\WindowsApps\pg.cmd` or `%APPDATA%\PackageGuard\bin` | Packed under `app/cli/pg.exe` and user bin shims |
| **Updates** | In-app / installer update flow | Microsoft Store automatic background update service |
| **Signing** | Code-signing certificate or self-signed for dev | Signed automatically by Microsoft during Store ingestion |

---

## 2. Prerequisites

Ensure your Windows development machine has:

* **Node.js**: v20 or v22 (Active LTS)
* **pnpm**: v9+ (or repo standard pnpm workspace)
* **Windows OS**: Windows 10 (Build 17763 / Version 1809 or higher) or Windows 11
* **.NET Framework**: 4.5+ (includes `csc.exe` used by `scripts/build-cli-exe.mjs`)
* **PowerShell**: 5.1 or 7+ (used for asset generation and build tools)
* **Microsoft Partner Center Account**: Active Windows & Xbox developer program account

---

## 3. Microsoft Partner Center Identity Configuration

For Microsoft Store submission, the identity in the MSIX manifest must match your reserved application in Partner Center.

### A. Values to Retrieve from Partner Center

1. Sign in to [Microsoft Partner Center](https://partner.microsoft.com/dashboard).
2. Navigate to **Apps and games > Package Guard (or your reserved app name)**.
3. In the left navigation, select **Product management > Product Identity**.
4. Retrieve the following three values:

| Partner Center Field | Description | Example Format |
| :--- | :--- | :--- |
| **Package/Identity/Name** | The unique Package Identity Name | `LupusVenture.PackageGuard` or `12345YourName.PackageGuard` |
| **Package/Identity/Publisher** | Publisher Distinguished Name (Subject) | `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` |
| **Properties/PublisherDisplayName** | Publisher Display Name | `Lupus Venture` |

### B. Setting Identity in Package Guard

You can supply your Partner Center identity in any of the following ways **without modifying code**:

#### Method 1: Environment Variables (Recommended for CI/CD and Local Releases)
Create or update your `.env` file in the project root:

```env
MS_STORE_IDENTITY_NAME=YourPartnerCenterPackageName
MS_STORE_PUBLISHER=CN=YOUR-PARTNER-CENTER-PUBLISHER-ID
MS_STORE_PUBLISHER_DISPLAY_NAME="Lupus Venture"
```

Or set them in PowerShell before building:

```powershell
$env:MS_STORE_IDENTITY_NAME = "YourPartnerCenterPackageName"
$env:MS_STORE_PUBLISHER = "CN=YOUR-PARTNER-CENTER-PUBLISHER-ID"
$env:MS_STORE_PUBLISHER_DISPLAY_NAME = "Lupus Venture"
pnpm run build:win:msix
```

#### Method 2: In `build/electron-builder.config.js`
Alternatively, edit the `appx` section directly in `build/electron-builder.config.js`:

```javascript
appx: {
  identityName: 'YourPartnerCenterPackageName',
  publisher: 'CN=YOUR-PARTNER-CENTER-PUBLISHER-ID',
  publisherDisplayName: 'Lupus Venture',
  applicationId: 'PackageGuard',
  displayName: 'Package Guard',
  ...
}
```

> [!WARNING]
> Do not upload an MSIX package to Partner Center with the placeholder publisher `CN=00000000-0000-0000-0000-000000000000`. Partner Center ingestion will reject any package whose Publisher DN or Package Name does not match your reserved identity.

---

## 4. Build Scripts & Commands

The project supports independent, dedicated commands for each target:

| Command | Action | Output Artifact |
| :--- | :--- | :--- |
| `pnpm run build:win:msix` | Compiles libs, frontend, CLI launcher, modules, and generates the MSIX package | `release/PackageGuard-1.0.0-x64.msix` |
| `pnpm run build:win:exe` | Compiles libs, frontend, CLI launcher, modules, and generates the NSIS EXE installer | `release/PackageGuard-Setup.exe` |
| `pnpm run build:win` | Alias for `build:win:exe` (preserves existing Windows default) | `release/PackageGuard-Setup.exe` |
| `pnpm run build` | Default multi-target production build | `release/PackageGuard-Setup.exe` |
| `pnpm run generate:appx-assets` | Re-generates all official Microsoft Store visual tile assets from `build/icon.png` | `build/appx/*.png` |

---

## 5. Visual Tile Assets

Microsoft Store packages require specific icon sizes for Start menu tiles, taskbars, and store listings. These are pre-generated from `build/icon.png` into `build/appx/`:

* `StoreLogo.png` (50x50) — Microsoft Store catalog icon
* `Square150x150Logo.png` (150x150) — Medium Start tile
* `Square44x44Logo.png` (44x44) — App list and taskbar icon
* `Wide310x150Logo.png` (310x150) — Wide Start tile
* `Square71x71Logo.png` (71x71) — Small Start tile
* `Square310x310Logo.png` (310x310) — Large Start tile
* `SplashScreen.png` (620x300) — UWP / Centennial splash screen

If you ever update `build/icon.png`, run:
```powershell
pnpm run generate:appx-assets
```

---

## 6. Application Compatibility & MSIX Container Model

### A. Local Storage & Database Safety
* **Read-Only Installation Folder**: Under MSIX, `C:\Program Files\WindowsApps\<PackageFamilyName>` is strictly read-only.
* **Guarded Paths**: Package Guard's `pathGuard.js` and `runtimePaths.js` already prohibit writing to Program Files or drive roots.
* **Storage Location**: The application stores all databases (`packageguard.db`), configurations (`settings.json`), snapshots, and runtime logs inside `%APPDATA%\PackageGuard`.
* **Centennial Virtualization**: When the MSIX package runs, Windows Centennial automatically virtualizes `%APPDATA%` to:
  ```
  %LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalCache\Roaming\PackageGuard
  ```
  This folder is fully writable and isolated per user.

### B. Child Process & CLI Execution
* The package requests the standard `<rescap:Capability Name="runFullTrust"/>` capability.
* `pg.exe` and `path-manager.ps1` are bundled into the package under `app/cli/`.
* When launched, the application executes as a standard Full Trust desktop bridge process with normal user privileges.

### C. Updates Mechanism Separation
* **NSIS EXE Distribution**: Update logic (or `electron-updater`) is used for web/direct downloads.
* **Microsoft Store Distribution**: Updates are delivered automatically in the background through the Windows Store infrastructure.
* The application can detect Store execution via `process.windowsStore`:
  ```javascript
  if (process.windowsStore) {
    // Disable web updater; Microsoft Store handles updates automatically
  }
  ```

---

## 7. Local Testing & Sideloading (Development Workflow)

Because Microsoft signs Store packages during ingestion, packages generated by `build:win:msix` are intentionally created in **Store-submission mode** (unsigned by a commercial cert).

Windows 10/11 will block direct installation of an unsigned MSIX unless it is signed with a certificate trusted by the local machine.

### Testing Procedure on a Clean Windows Machine

1. **Generate a local test certificate**:
   ```powershell
   $cert = New-SelfSignedCertificate `
     -Type Custom `
     -Subject "CN=00000000-0000-0000-0000-000000000000" `
     -KeyUsage DigitalSignature `
     -FriendlyName "PackageGuard Test Cert" `
     -CertStoreLocation "Cert:\CurrentUser\My" `
     -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
   ```
   *(Note: The Subject must match the `Publisher` in your MSIX package manifest).*

2. **Trust the Certificate**:
   Export and import the certificate into the **Trusted People** store of the local machine:
   ```powershell
   Export-Certificate -Cert $cert -FilePath "$env:TEMP\PackageGuardTest.cer"
   Import-Certificate -FilePath "$env:TEMP\PackageGuardTest.cer" -CertStoreLocation "Cert:\LocalMachine\TrustedPeople"
   ```

3. **Sign the package for local testing**:
   Using `signtool.exe` (from Windows Kits or electron-builder's cache):
   ```powershell
   $signtool = (Get-ChildItem -Path "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Filter "signtool.exe" -Recurse | Select-Object -First 1).FullName
   & $signtool sign /fd SHA256 /a /s My /n "PackageGuard Test Cert" "release/PackageGuard-1.0.0-x64.msix"
   ```

4. **Install the package**:
   Double-click `release/PackageGuard-1.0.0-x64.msix` or install via PowerShell:
   ```powershell
   Add-AppxPackage -Path "release/PackageGuard-1.0.0-x64.msix"
   ```

5. **Verify Application**:
   * Launch **Package Guard** from the Start Menu.
   * Verify settings, scanning, snapshot creation, and database persistence.
   * Verify CLI shim registration and command execution (`pg status`).
   * Restart the application and confirm data persists.

6. **Uninstall the package**:
   Right-click **Package Guard** in Start Menu and select **Uninstall**, or run:
   ```powershell
   Remove-AppxPackage -Package (Get-AppxPackage *PackageGuard*).PackageFullName
   ```

---

## 8. Microsoft Store Submission Steps

Once you are ready to release:

1. **Configure Partner Center Identity**:
   Ensure `MS_STORE_IDENTITY_NAME`, `MS_STORE_PUBLISHER`, and `MS_STORE_PUBLISHER_DISPLAY_NAME` are set to match your Partner Center app reservation.

2. **Generate the Store MSIX**:
   ```powershell
   pnpm run build:win:msix
   ```
   Verify the generated artifact at:
   `release/PackageGuard-1.0.0-x64.msix`

3. **Validate Package with Windows App Certification Kit (WACK)** *(Optional but recommended)*:
   If Windows SDK is installed:
   ```powershell
   appcert.exe test -appxpackagepath "release/PackageGuard-1.0.0-x64.msix" -reportoutputpath "release/wack-report.xml"
   ```

4. **Upload to Microsoft Partner Center**:
   * Go to **Partner Center > Apps and games > Package Guard > Submissions**.
   * Start a new submission.
   * In the **Packages** section, drag and drop `release/PackageGuard-1.0.0-x64.msix`.
   * Partner Center will inspect the package, verify the package identity and architecture (`x64`), and validate that `runFullTrust` is declared.
   * Complete the Store listing details (description, screenshots from `build/appx`, privacy policy).
   * Submit to the certification queue. Microsoft will sign the package with their trusted Store certificate upon publication.

---

## 9. Future Release Checklist

- [ ] Bump version in root `package.json` (e.g. `1.0.1`).
- [ ] Verify or set Partner Center identity environment variables.
- [ ] Run `pnpm run build:win:exe` to verify the NSIS EXE installer.
- [ ] Run `pnpm run build:win:msix` to generate the Store MSIX package.
- [ ] Inspect `release/PackageGuard-<version>-x64.msix` manifest.
- [ ] Upload the `.msix` package to Microsoft Partner Center for review.

