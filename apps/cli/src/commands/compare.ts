import * as fs from "node:fs";
import type BetterSqlite3 from "better-sqlite3";
import { getAllProjects } from "../services/project-service";
import { getProjectPackages } from "../services/package-service";

export async function executeCompare(
  db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[]
): Promise<number> {
  const p1NameOrId = args[0];
  const p2NameOrId = args[1];

  if (!p1NameOrId || !p2NameOrId) {
    console.error("Error: Two project names or IDs are required.");
    console.error("Usage: pg compare <project1> <project2>\n");
    return 2;
  }

  const allProjects = getAllProjects(db);
  const p1 = allProjects.find(
    (p) => p.id.toLowerCase() === p1NameOrId.toLowerCase() || p.name.toLowerCase() === p1NameOrId.toLowerCase()
  );
  const p2 = allProjects.find(
    (p) => p.id.toLowerCase() === p2NameOrId.toLowerCase() || p.name.toLowerCase() === p2NameOrId.toLowerCase()
  );

  if (!p1) {
    console.error(`Error: Project '${p1NameOrId}' not found. Run 'pg projects' to list available projects.\n`);
    return 3;
  }
  if (!p2) {
    console.error(`Error: Project '${p2NameOrId}' not found. Run 'pg projects' to list available projects.\n`);
    return 3;
  }

  const pkgs1 = getProjectPackages(p1.path);
  const pkgs2 = getProjectPackages(p2.path);

  const map1 = new Map(pkgs1.map((p) => [p.name, p.version]));
  const map2 = new Map(pkgs2.map((p) => [p.name, p.version]));

  const common: Array<{ name: string; v1: string; v2: string }> = [];
  const uniqueToP1: Array<{ name: string; version: string }> = [];
  const uniqueToP2: Array<{ name: string; version: string }> = [];
  const versionDiffs: Array<{ name: string; v1: string; v2: string }> = [];

  for (const [name, v1] of map1.entries()) {
    const v2 = map2.get(name);
    if (v2 !== undefined) {
      common.push({ name, v1, v2 });
      if (v1 !== v2) {
        versionDiffs.push({ name, v1, v2 });
      }
    } else {
      uniqueToP1.push({ name, version: v1 });
    }
  }

  for (const [name, v2] of map2.entries()) {
    if (!map1.has(name)) {
      uniqueToP2.push({ name, version: v2 });
    }
  }

  console.log(`Comparison: ${p1.name} vs ${p2.name}\n`);
  console.log(`Total packages in ${p1.name}: ${pkgs1.length}`);
  console.log(`Total packages in ${p2.name}: ${pkgs2.length}`);
  console.log(`Common packages:             ${common.length}`);
  console.log(`Version differences:         ${versionDiffs.length}`);
  console.log(`Unique to ${p1.name}:        ${uniqueToP1.length}`);
  console.log(`Unique to ${p2.name}:        ${uniqueToP2.length}\n`);

  if (versionDiffs.length > 0) {
    console.log("Version Differences:");
    for (const vd of versionDiffs) {
      console.log(`  ~ ${vd.name}: ${p1.name}@${vd.v1} vs ${p2.name}@${vd.v2}`);
    }
    console.log();
  }

  if (uniqueToP1.length > 0) {
    console.log(`Only in ${p1.name}:`);
    for (const u of uniqueToP1.slice(0, 15)) {
      console.log(`  + ${u.name}@${u.version}`);
    }
    if (uniqueToP1.length > 15) {
      console.log(`  ... and ${uniqueToP1.length - 15} more`);
    }
    console.log();
  }

  if (uniqueToP2.length > 0) {
    console.log(`Only in ${p2.name}:`);
    for (const u of uniqueToP2.slice(0, 15)) {
      console.log(`  + ${u.name}@${u.version}`);
    }
    if (uniqueToP2.length > 15) {
      console.log(`  ... and ${uniqueToP2.length - 15} more`);
    }
    console.log();
  }

  return 0;
}
