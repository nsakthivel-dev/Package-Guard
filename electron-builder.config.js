/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: "com.lupusventure.packageguard",
  productName: "PackageGuard",
  directories: {
    output: "release-v1",
  },
  files: [
    "electron/**/*",
    "database/**/*",
    "artifacts/package-guard/dist/**/*"
  ],
  win: {
    target: "nsis",
    forceCodeSigning: false
  },
  mac: {
    target: "dmg"
  },
  linux: {
    target: "AppImage"
  }
};
