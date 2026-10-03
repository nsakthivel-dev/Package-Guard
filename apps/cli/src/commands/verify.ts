import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { verifyProject } from "../services/verify-service";
import { insertHistory } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeVerify(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const cleanArgs = args.filter((a) => a !== "--json" && a !== "-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "verify",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const isDeep = cleanArgs.includes("--deep");
  const result = await verifyProject(db, project.id, projectDir, { deep: isDeep });

  insertHistory(db, {
    projectId: project.id,
    eventType: "VERIFY",
    description: `Verification (${isDeep ? "deep" : "standard"}): ${result.status} (${result.filesChecked} files checked)`,
    detailsJson: JSON.stringify(result)
  });

  await sendCliEvent("verify", {
    projectId: project.id,
    projectName: project.name,
    filesChecked: result.filesChecked,
    valid: result.valid,
    changed: result.changed,
    missing: result.missing,
    unexpected: result.unexpected,
    status: result.status,
    details: result.details,
    deep: isDeep
  }, project.id);

  if (result.status === "OK") {
    return outputSuccess(
      "verify",
      result,
      jsonMode,
      () => {
        console.log(`Package Guard Verification${isDeep ? " (deep mode)" : ""}\n`);
        console.log(`Files checked: ${result.filesChecked.toLocaleString()}`);
        console.log(`Valid:         ${result.valid.toLocaleString()}`);
        console.log(`Changed:       ${result.changed.toLocaleString()}`);
        console.log(`Missing:       ${result.missing.toLocaleString()}`);
        console.log(`Unexpected:    ${result.unexpected.toLocaleString()}`);
        console.log(`\nResult: ${result.status}\n`);
      }
    );
  }

  // Verification detected differences or corruption -> exit 4
  return outputError(
    "verify",
    "VERIFICATION_ISSUES",
    `Verification failed with status: ${result.status}`,
    4,
    jsonMode,
    result
  );
}
