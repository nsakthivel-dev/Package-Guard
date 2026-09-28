import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getDependencyTree } from "../services/package-service";

export async function executeTree(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const tree = getDependencyTree(projectDir);

  console.log(`Dependency Tree — ${project.name}\n`);
  console.log(`${project.name}@1.0.0 (${projectDir})`);

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    const isLast = i === tree.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const prefix = isLast ? "    " : "│   ";

    console.log(`${branch}${node.name}@${node.version} [${node.type}]`);

    if (node.dependencies && node.dependencies.length > 0) {
      for (let j = 0; j < node.dependencies.length; j++) {
        const sub = node.dependencies[j];
        const isSubLast = j === node.dependencies.length - 1;
        const subBranch = isSubLast ? "└── " : "├── ";
        console.log(`${prefix}${subBranch}${sub.name}@${sub.version}`);
      }
    }
  }
  console.log();

  return 0;
}
