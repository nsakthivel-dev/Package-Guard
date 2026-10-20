import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const prodModulesDir = path.join(rootDir, "prod-modules");
fs.rmSync(prodModulesDir, { recursive: true, force: true });
fs.mkdirSync(prodModulesDir, { recursive: true });

function resolveModuleDir(pkgName) {
  const localPath = path.join(rootDir, "node_modules", pkgName);
  if (fs.existsSync(localPath)) return localPath;
  const parentPath = path.join(rootDir, "..", "node_modules", pkgName);
  if (fs.existsSync(parentPath)) return parentPath;
  return null;
}

// 1. Prepare @package-guard/shared and @packageguard/shared
const sharedSrc = path.join(rootDir, "packages", "shared");
for (const scopeName of ["@package-guard", "@packageguard"]) {
  const dest = path.join(prodModulesDir, scopeName, "shared");
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(sharedSrc, "dist"), path.join(dest, "dist"), { recursive: true, dereference: true });
  fs.copyFileSync(path.join(sharedSrc, "package.json"), path.join(dest, "package.json"));
}

// 2-5. Copy native modules
for (const pkg of ["better-sqlite3-electron", "better-sqlite3", "bindings", "file-uri-to-path"]) {
  const src = resolveModuleDir(pkg);
  if (src) {
    fs.cpSync(src, path.join(prodModulesDir, pkg), { recursive: true, dereference: true });
    console.log(`Copied ${pkg} from ${src}`);
  } else {
    console.warn(`Warning: Could not locate ${pkg}`);
  }
}

console.log("prod-modules prepared successfully at:", prodModulesDir);
