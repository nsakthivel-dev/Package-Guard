# Preservation Baseline — Recorded on Unfixed Code

Date: Recorded before any fix changes were applied.
Workspace state: UNFIXED (both `packages/api-client` and `lib/api-client-react` registered, duplicate bug condition present).

---

## Check 1: `pnpm --filter @packageguard/cli build`

**Command:** `pnpm --filter @packageguard/cli build`
**Exit code:** 0
**Output summary:** `tsc -p tsconfig.json` completed successfully.
**Result: PASS** ✓

The CLI TypeScript sources compile cleanly to `packages/cli/dist/`.

---

## Check 2: `pnpm run build:libs`

**Command:** `pnpm run build:libs`  
**Expands to:** `pnpm --filter @packageguard/shared build && pnpm --filter @packageguard/database build && pnpm --filter @packageguard/core build && pnpm --filter @packageguard/cli build`
**Exit code:** 0
**Output summary:** All four `tsc -p tsconfig.json` invocations completed successfully.
**Result: PASS** ✓

All library packages (`shared`, `database`, `core`, `cli`) build without errors.

---

## Check 3: `pnpm --filter @packageguard/desktop-renderer build`

**Command:** `pnpm --filter @packageguard/desktop-renderer build`
**Exit code:** 0
**Output:** `No projects matched the filters in "...PackageGuard"`
**Result: PASS (with important caveat)** ⚠️

**Important finding:** `apps/desktop/renderer` is NOT registered as a workspace package in `pnpm-workspace.yaml`. The package name `@packageguard/desktop-renderer` exists in `apps/desktop/renderer/package.json`, but that directory is not listed under `packages:` in the workspace config. Therefore:

- `pnpm --filter @packageguard/desktop-renderer` finds no matching project and exits 0 silently.
- The renderer's `node_modules` are NOT installed (no `apps/desktop/renderer/node_modules/`).
- Running `pnpm run build` directly inside `apps/desktop/renderer` fails with `Cannot find package 'vite'`.
- `pnpm run build:frontend` at the workspace root also exits 0 silently (same reason).

**Baseline:** The renderer build command exits 0 (no-op / "no projects matched") on the unfixed workspace. This is the observed baseline — the renderer cannot actually be built from the workspace root via pnpm filter in the current configuration.

**Note for post-fix:** The fix for task 3 (removing `packages/api-client`) does NOT address the renderer workspace registration. If the renderer needs to be buildable, `apps/desktop/renderer` would need to be added to `pnpm-workspace.yaml` — but that is out of scope for this migration spec. The preservation requirement is simply that the command continues to exit 0 after the fix (same behavior).

---

## Check 4: `node packages/cli/dist/index.js --version`

**Command:** `node packages/cli/dist/index.js --version`
**Exit code:** 1
**Output:** 
```
Error [ERR_UNSUPPORTED_DIR_IMPORT]: Directory import
'...packages/shared/src/types' is not supported resolving ES modules
```
**Result: FAIL** ✗

**Root cause analysis:**
- `packages/cli/dist/index.js` is CommonJS (compiled by `tsc` with `"module": "CommonJS"`).
- It `require("@packageguard/shared")` at runtime.
- `packages/shared/package.json` has `"main": "src/index.ts"` and `"exports"` pointing to `.ts` source files.
- Node.js cannot execute `.ts` files directly. When `packages/shared/src/index.ts` itself imports `./types` (a directory), Node throws `ERR_UNSUPPORTED_DIR_IMPORT`.
- The CLI `dist/` eagerly imports all commands at startup (including ones that use shared), so even `--version` triggers the error before Commander can intercept it.

**Baseline:** The CLI smoke test `node packages/cli/dist/index.js --version` **fails on the unfixed workspace** with exit code 1. This is the pre-existing state and is unrelated to the duplicate workspace entry bug. The fix (removing `packages/api-client`) does not need to change this behavior — this check should remain at exit code 1 after the fix (no regression introduced, no fix introduced for this pre-existing issue).

**Note:** The CLI *builds* successfully (check 1 passes). The runtime failure is due to `packages/shared` exporting its TypeScript source files directly rather than compiled output. This is a separate issue from the duplicate package name bug.

---

## Summary Table

| Check | Command | Baseline Result | Exit Code |
|---|---|---|---|
| 1 | `pnpm --filter @packageguard/cli build` | **PASS** | 0 |
| 2 | `pnpm run build:libs` | **PASS** | 0 |
| 3 | `pnpm --filter @packageguard/desktop-renderer build` | **PASS (no-op — no projects matched)** | 0 |
| 4 | `node packages/cli/dist/index.js --version` | **FAIL (pre-existing, unrelated to bug)** | 1 |

---

## Additional Observations (from pnpm ls)

- `pnpm ls -r` confirms the duplicate bug: `@packageguard/api-client-react` appears **twice** — once for `lib/api-client-react` and once for `packages/api-client`.
- `apps/desktop/node_modules/@packageguard/api-client-react` is a junction pointing to `packages/api-client` (the duplicate entry, not `lib/api-client-react`).
- After the fix (task 3), this symlink must be regenerated by `pnpm install` to point to `lib/api-client-react`.

---

## Preservation Contract for Task 3.5

After the fix, the following outcomes MUST hold:

| Check | Required Post-Fix Result |
|---|---|
| `pnpm --filter @packageguard/cli build` | exit 0 |
| `pnpm run build:libs` | exit 0 |
| `pnpm --filter @packageguard/desktop-renderer build` | exit 0 (no-op, same as baseline) |
| `node packages/cli/dist/index.js --version` | exit 1 (same pre-existing failure — no regression) |
