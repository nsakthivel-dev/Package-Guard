# Codebase Audit, Cleanup and Architecture Migration — Design

## Overview

The repository has accumulated three generations of code. The active generation (Gen 3) lives in `apps/desktop/`, `packages/`, and `lib/`. Earlier generations created structural noise: duplicate package names, stale workspace registrations, and mismatched tsconfig references that prevent clean builds.

**Current state** (confirmed by audit):
- `packages/cli/package.json` name is already `@packageguard/cli` ✓
- All CLI source files already import from `@packageguard/shared` ✓
- `pnpm-workspace.yaml` already includes `packages/cli` and `lib/api-client-react` ✓
- `tsconfig.json` already references `packages/cli` ✓
- Legacy folders (`electron/`, `backend/`, `frontend/`, `apps/cli/`, `packages/shared-paths/`) are already absent from the working tree ✓

**Remaining problems** (the actual work):
1. `packages/api-client` is an exact duplicate of `lib/api-client-react` — both register as `@packageguard/api-client-react` in the workspace, creating a duplicate name conflict.
2. `packages/api-client` is listed in `pnpm-workspace.yaml` but should not be — `lib/api-client-react` is the canonical location.
3. Neither `packages/api-client` nor `lib/api-client-react` appears in `tsconfig.json` references (renderer handles it via Vite, which is correct — this is not a bug).
4. End-to-end verification (Electron start, renderer load, CLI build) has not been run against the cleaned-up state.

The fix is surgical: remove `packages/api-client` from the workspace declaration, delete the duplicate directory, and run the verification checklist.

---

## Glossary

- **Bug_Condition (C)**: The condition that causes an inconsistent/broken workspace state — specifically, two workspace packages sharing the same `name` field (`@packageguard/api-client-react`), registered in `pnpm-workspace.yaml` under `packages/api-client` and `lib/api-client-react`.
- **Property (P)**: The desired post-fix state — every package name in the workspace is unique, every reference resolves to exactly one source, and all build/run verification checks pass.
- **Preservation**: The active application behaviour must be unchanged — Electron starts, renderer loads, CLI builds, and IPC communication functions as documented.
- **Canonical package**: The workspace package that is the single authoritative source for a given `name`.
- **Duplicate package**: A workspace package with a `name` that is already claimed by another workspace entry.
- **Gen 3 active code**: `apps/desktop/`, `packages/core`, `packages/database`, `packages/shared`, `packages/cli`, `lib/api-client-react`.
- **`pnpm-workspace.yaml`**: Declares which directories are workspace packages; pnpm uses it to resolve `workspace:*` references.
- **`tsconfig.json` (root)**: Lists TypeScript project references for composite builds; must point at directories that contain a valid `tsconfig.json` with `composite: true`.

---

## Bug Details

### Bug Condition

The workspace contains two directories that both declare `"name": "@packageguard/api-client-react"`:

| Directory | Name in package.json |
|---|---|
| `packages/api-client` | `@packageguard/api-client-react` |
| `lib/api-client-react` | `@packageguard/api-client-react` |

Both are listed in `pnpm-workspace.yaml`. pnpm's behaviour with duplicate workspace package names is undefined — depending on resolution order, `workspace:*` references from `apps/desktop` and `apps/desktop/renderer` may silently resolve to either copy. The two copies are currently byte-for-byte identical, so there is no observable behavioural difference today, but the duplicate is a latent defect: any change applied to one copy will not propagate to the other, and pnpm installs may become non-deterministic.

**Formal Specification:**
```
FUNCTION isBugCondition(workspace)
  INPUT:  workspace — the set of {directory, packageName} pairs in pnpm-workspace.yaml
  OUTPUT: boolean

  names := [entry.packageName FOR entry IN workspace]
  RETURN EXISTS name IN names SUCH THAT count(names, name) > 1
END FUNCTION
```

### Examples

- **Duplicate name**: `packages/api-client` (name=`@packageguard/api-client-react`) and `lib/api-client-react` (name=`@packageguard/api-client-react`) — `isBugCondition` returns `true`.
- **Non-duplicate**: After removing `packages/api-client` from the workspace, only `lib/api-client-react` carries the name — `isBugCondition` returns `false`.
- **Edge case — all other packages**: `packages/shared`, `packages/cli`, `packages/core`, `packages/database`, `apps/desktop` each have unique names — `isBugCondition` returns `false` for these.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `apps/desktop/renderer` resolves `@packageguard/api-client-react` and builds without error.
- `apps/desktop` (Electron main) resolves `@packageguard/api-client-react` and starts without error.
- `packages/cli` builds (`pnpm --filter @packageguard/cli build`) without error.
- The IPC bridge (named-pipe + chokidar fallback + HTTP on port 48291+) continues to function as documented.
- `apps/desktop/main/main.js` continues to resolve `package.json` version via its existing relative path.
- Path resolution in `runtimePaths.js` continues to produce correct AppData-rooted paths.

**Scope:**
All workspace packages other than the duplicate entry are completely unaffected. No source file changes are required — only `pnpm-workspace.yaml` is modified and the `packages/api-client` directory is deleted.

---

## Hypothesized Root Cause

The duplicate arose from a directory reorganisation mid-project:

1. **Copy-before-delete pattern**: `packages/api-client` was the original home. When the project restructured to separate `lib/` from `packages/`, the directory was copied to `lib/api-client-react` but the original was never removed from the workspace declaration.

2. **No name-uniqueness guard**: pnpm does not error on duplicate workspace names by default — it silently resolves the conflict by last-definition-wins or alphabetical ordering, making the problem invisible during daily development.

3. **Identical content masked the problem**: Because both copies are currently identical (confirmed via byte comparison), no runtime failure surfaced. The issue would only become visible when the copies diverge.

---

## Correctness Properties

Property 1: Bug Condition — Workspace Package Names Are Unique

_For any_ workspace state where `isBugCondition` returns `true` (duplicate package names exist), the fixed `pnpm-workspace.yaml` SHALL list each package name exactly once, so that `isBugCondition` returns `false` after the fix is applied.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Active Application Continues to Function

_For any_ workspace state where `isBugCondition` does NOT hold (no duplicates), the fixed workspace SHALL produce the same build and runtime results as the pre-fix workspace: the renderer builds, the Electron process starts, the CLI builds, and all IPC channels operate correctly.

**Validates: Requirements 3.1, 3.2, 3.3**

---

## Fix Implementation

### Changes Required

#### File: `pnpm-workspace.yaml`

**Change**: Remove the `packages/api-client` entry from the `packages:` list.

Before:
```yaml
packages:
  - apps/desktop
  - packages/cli
  - packages/core
  - packages/database
  - packages/shared
  - packages/api-client       # ← remove this line
  - lib/api-client-react
```

After:
```yaml
packages:
  - apps/desktop
  - packages/cli
  - packages/core
  - packages/database
  - packages/shared
  - lib/api-client-react
```

#### Directory: `packages/api-client/`

**Change**: Delete the entire directory. It is a byte-for-byte duplicate of `lib/api-client-react`. No files in the workspace import from `packages/api-client` directly — all references go through the package name `@packageguard/api-client-react`, which will continue to resolve to `lib/api-client-react`.

#### Post-change: `pnpm install`

Run `pnpm install` after the workspace change to regenerate `pnpm-lock.yaml` and symlinks in `node_modules`. This ensures the removed workspace entry is purged from the lock file and the `@packageguard/api-client-react` symlink points solely to `lib/api-client-react`.

### No Other Changes Required

The audit confirmed that all other issues described in the requirements are already resolved in the working tree:

| Issue | Status |
|---|---|
| `packages/cli` rename to `@packageguard/cli` | ✓ Already done |
| CLI imports updated from `@workspace/shared-paths` to `@packageguard/shared` | ✓ Already done |
| `pnpm-workspace.yaml` includes `packages/cli` | ✓ Already present |
| `pnpm-workspace.yaml` includes `lib/api-client-react` | ✓ Already present |
| `tsconfig.json` references `packages/cli` | ✓ Already references correct path |
| `apps/cli/` skeleton deleted | ✓ Absent from tree |
| `packages/shared-paths/` deleted | ✓ Absent from tree |
| Legacy `electron/`, `backend/`, `frontend/` deleted | ✓ Absent from tree |
| `lib/api-client-react` name is `@packageguard/api-client-react` | ✓ Already correct |
| **`packages/api-client` duplicate in workspace** | ✗ **Requires fix** |

---

## Testing Strategy

### Validation Approach

Two phases: first confirm the duplicate causes the bug condition (`isBugCondition` returns `true`), then verify the fix resolves it and all preservation checks pass.

### Exploratory Bug Condition Checking

**Goal**: Surface the duplicate before applying the fix. Confirm that both workspace entries share the same package name and that removing one is safe.

**Test Plan**: Inspect `pnpm-workspace.yaml` and the `package.json` of each listed directory. Run `pnpm ls --depth 0` to observe how pnpm reports the duplicate. Run the verification checklist on the current state to capture a baseline.

**Test Cases**:
1. **Name collision check**: Read `packages/api-client/package.json` and `lib/api-client-react/package.json` — both must show `"name": "@packageguard/api-client-react"` (confirms the bug condition).
2. **Content identity check**: Diff the `src/` directories of both packages — confirm they are identical (confirms safe deletion).
3. **Reference audit**: Search all `package.json` files for `@packageguard/api-client-react` — confirm only `apps/desktop/renderer` and `apps/desktop` reference it, and neither references `packages/api-client` by path.
4. **pnpm resolution check**: Run `pnpm ls --filter @packageguard/desktop-renderer --depth 1` — observe which of the two copies pnpm resolves the `workspace:*` reference to.

**Expected Counterexamples**:
- `isBugCondition` returns `true` — two entries in the workspace share the same name.
- `pnpm ls` may report an ambiguous or duplicated entry for `@packageguard/api-client-react`.

### Fix Checking

**Goal**: Verify that after the fix `isBugCondition` returns `false` — the workspace has no duplicate names.

**Pseudocode:**
```
FOR ALL entry IN pnpm-workspace.yaml.packages DO
  names.push(readPackageJson(entry).name)
END FOR

FOR ALL name IN names DO
  ASSERT count(names, name) == 1
END FOR
```

### Preservation Checking

**Goal**: Verify that for all workspace packages that were not touched by the fix, behaviour is unchanged.

**Pseudocode:**
```
FOR ALL package IN workspace WHERE package != "packages/api-client" DO
  ASSERT build(package)_fixed == build(package)_original
END FOR
```

**Testing Approach**: Property-based testing is not applicable here — this is a configuration change with a finite, enumerable verification surface. Manual verification against a checklist is the correct approach, supplemented by the existing build pipeline.

**Test Plan**: Observe build and start behaviour on the pre-fix state as a baseline, then verify the same checks pass post-fix.

**Test Cases**:
1. **CLI build preservation**: `pnpm --filter @packageguard/cli build` must exit 0 before and after the fix.
2. **Renderer build preservation**: `pnpm --filter @packageguard/desktop-renderer build` must exit 0 after the fix, resolving `@packageguard/api-client-react` to `lib/api-client-react`.
3. **Library build preservation**: `pnpm run build:libs` must exit 0 after the fix.
4. **Electron start preservation**: `pnpm run start` must launch the Electron window and load the renderer without errors after the fix.
5. **Lock file consistency**: `pnpm install` must complete without errors and `pnpm-lock.yaml` must no longer reference `packages/api-client`.

### Unit Tests

- Verify `pnpm-workspace.yaml` lists exactly one entry per unique package name after the change.
- Verify `packages/api-client` directory no longer exists.
- Verify `lib/api-client-react/package.json` still has `"name": "@packageguard/api-client-react"`.

### Property-Based Tests

Property-based testing is not applicable to this migration — the workspace state space is small and fully enumerable. All verification is done via deterministic build and start checks listed above.

### Integration Tests

- **Electron launch**: Run `pnpm run start`, confirm the main window opens and the renderer loads without white-screen or console errors.
- **CLI smoke test**: After `pnpm --filter @packageguard/cli build`, run `node packages/cli/dist/index.js --version` and confirm it outputs the version string.
- **IPC bridge**: Start Electron, then trigger a CLI write (e.g. `pg scan`) — confirm the Electron renderer receives the update notification within 2 seconds, validating the HTTP bridge on port 48291+.

---

## Paths Report

All hardcoded paths in the Gen 3 active code are intentional and correct. No path changes are required as part of this migration.

| Location | Path | Status |
|---|---|---|
| `apps/desktop/main/runtimePaths.js` | `%APPDATA%\Package Guard` (Win), `~/Library/Application Support/Package Guard` (mac), `~/.config/Package Guard` (Linux) | ✓ Intentional — matches `productName` in electron-builder config |
| `apps/desktop/main/main.js` | `../../../../package.json` (version read) | ✓ Correct relative resolution from development layout |
| `apps/desktop/main/main.js` | `../preload/index.js` | ✓ Correct |
| `apps/desktop/main/paths.js` | `../renderer/dist/index.html` | ✓ Correct |
| `packages/shared/src/paths/index.ts` | Same AppData-rooted strategy as `runtimePaths.js` | ✓ Consistent, single source of truth for CLI path resolution |
| `packages/cli/src/` | No hardcoded paths — uses `getDbJsonPath()`, `getServerJsonPath()` from `@packageguard/shared` | ✓ Correct |
