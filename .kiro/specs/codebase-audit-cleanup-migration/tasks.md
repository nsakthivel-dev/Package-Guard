# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Duplicate Workspace Package Name
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the config when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface the duplicate package name in the workspace declaration
  - **Scoped approach**: The bug condition is deterministic and fully enumerable — scope the check to the concrete failing case
  - Read `packages/api-client/package.json` — confirm `"name"` is `"@packageguard/api-client-react"`
  - Read `lib/api-client-react/package.json` — confirm `"name"` is `"@packageguard/api-client-react"` (same name, two entries)
  - Read `pnpm-workspace.yaml` — confirm `packages/api-client` is listed alongside `lib/api-client-react`
  - Run `pnpm ls --filter @packageguard/desktop-renderer --depth 1` — observe how pnpm resolves the duplicate (ambiguous or last-wins)
  - Assert: `isBugCondition(workspace) === true` — at least two entries share the name `@packageguard/api-client-react`
  - Run test on UNFIXED workspace
  - **EXPECTED OUTCOME**: Bug condition confirmed (two directories, same package name, both listed in workspace)
  - Document the counterexample: "`packages/api-client` and `lib/api-client-react` both declare `\"name\": \"@packageguard/api-client-react\"`"
  - Mark task complete when the duplicate is confirmed and documented
  - _Requirements: 2.1, 2.2_

- [x] 2. Write preservation baseline checks (BEFORE implementing fix)
  - **Property 2: Preservation** - Active Workspace Builds on Unfixed Code
  - **IMPORTANT**: Follow observation-first methodology — capture the baseline on unfixed code before changing anything
  - Observe: `pnpm --filter @packageguard/cli build` exits 0 on unfixed code — record result
  - Observe: `pnpm run build:libs` exits 0 on unfixed code — record result
  - Observe: `pnpm --filter @packageguard/desktop-renderer build` exits 0 on unfixed code — record result
  - Observe: `node packages/cli/dist/index.js --version` outputs a version string — record result
  - Write down each observed result as the preservation baseline (these exact outcomes must still hold after the fix)
  - Run checks on UNFIXED workspace
  - **EXPECTED OUTCOME**: All checks PASS — this confirms the baseline behaviour to preserve
  - Mark task complete when all baseline checks are run and results are recorded
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix duplicate workspace package entry

  - [x] 3.1 Remove `packages/api-client` from `pnpm-workspace.yaml`
    - Open `pnpm-workspace.yaml`
    - Delete the line `  - packages/api-client` from the `packages:` list
    - Confirm `lib/api-client-react` remains in the list (the canonical entry)
    - Save the file
    - _Bug_Condition: isBugCondition(workspace) where two entries share "name": "@packageguard/api-client-react"_
    - _Expected_Behavior: After fix, isBugCondition returns false — every package name in pnpm-workspace.yaml is unique_
    - _Preservation: All other workspace entries (apps/desktop, packages/cli, packages/core, packages/database, packages/shared, lib/api-client-react) remain unchanged_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 3.2 Delete the `packages/api-client` directory
    - Verify `packages/api-client/src/` is byte-for-byte identical to `lib/api-client-react/src/` (safety check before deletion)
    - Delete the entire `packages/api-client/` directory
    - Confirm no source file in the workspace imports from `packages/api-client` by path (all references use the package name `@packageguard/api-client-react`)
    - _Bug_Condition: isBugCondition(workspace) — duplicate directory referenced in workspace_
    - _Expected_Behavior: packages/api-client directory no longer exists; lib/api-client-react is the sole canonical source_
    - _Preservation: lib/api-client-react/package.json still has "name": "@packageguard/api-client-react"; all workspace:* references continue to resolve correctly_
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Run `pnpm install` to regenerate the lock file
    - Run `pnpm install` from the workspace root
    - Confirm the command exits 0 without errors
    - Confirm `pnpm-lock.yaml` no longer references `packages/api-client`
    - Confirm the `@packageguard/api-client-react` symlink in `node_modules` points to `lib/api-client-react`
    - _Bug_Condition: lock file and node_modules still reference the now-deleted duplicate_
    - _Expected_Behavior: pnpm-lock.yaml is consistent with the updated pnpm-workspace.yaml; no dangling references_
    - _Preservation: All other workspace dependencies resolve identically to the pre-fix state_
    - _Requirements: 2.1, 2.2, 3.1_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Workspace Package Names Are Unique
    - **IMPORTANT**: Re-run the SAME checks from task 1 — do NOT write new checks
    - Read `pnpm-workspace.yaml` — confirm `packages/api-client` is absent
    - Collect all package names from every listed workspace directory
    - Assert each name appears exactly once: `isBugCondition(workspace) === false`
    - **EXPECTED OUTCOME**: Check PASSES (confirms the duplicate is resolved)
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Verify preservation baseline checks still pass
    - **Property 2: Preservation** - Active Workspace Builds on Fixed Code
    - **IMPORTANT**: Re-run the SAME checks from task 2 — do NOT write new checks
    - Run `pnpm --filter @packageguard/cli build` — must exit 0
    - Run `pnpm run build:libs` — must exit 0 (shared + database + core + cli)
    - Run `pnpm --filter @packageguard/desktop-renderer build` — must exit 0, resolving `@packageguard/api-client-react` to `lib/api-client-react`
    - Run `node packages/cli/dist/index.js --version` — must output the version string
    - **EXPECTED OUTCOME**: All checks PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Integration verification

  - [-] 4.1 Electron start and renderer load check
    - Start the Electron application (`pnpm run start` from `apps/desktop`)
    - Confirm the main window opens without a white screen or console errors
    - Confirm the renderer loads and the UI is functional
    - Confirm IPC communication is operational (named-pipe + HTTP bridge on port 48291+)
    - _Requirements: 3.1, 3.2_

  - [~] 4.2 Produce the final migration report
    - Create a `MIGRATION_REPORT.md` in the workspace root documenting:
      - Before/after architecture summary
      - Files deleted: `packages/api-client/` (entire directory)
      - Files modified: `pnpm-workspace.yaml` (removed `packages/api-client` entry)
      - Items already correct (no changes required): `packages/cli` name, CLI imports, tsconfig references, legacy folder removal
      - Build results from task 3.5: CLI build, libs build, renderer build, CLI smoke test
      - Paths report confirming all hardcoded paths are intentional and correct (from design §Paths Report)
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

- [~] 5. Checkpoint — Ensure all checks pass
  - Confirm tasks 1–4 are all complete
  - Confirm `isBugCondition(workspace) === false` (unique package names)
  - Confirm all build and start checks pass (no regressions)
  - Ask the user if any questions arise before closing the spec
