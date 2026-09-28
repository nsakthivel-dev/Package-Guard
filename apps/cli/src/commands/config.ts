import type BetterSqlite3 from "better-sqlite3";
import { getConfig, setConfig, resetConfig, listConfig } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

export async function executeConfig(
  db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[]
): Promise<number> {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "get") {
    const key = args[1];
    if (!key) {
      console.error("Error: Key required. Usage: pg config get <key>");
      return 2;
    }
    const val = getConfig(db, key);
    if (val === undefined) {
      console.log(`(not set)`);
      return 1;
    }
    console.log(`${key} = ${val}`);
    return 0;
  }

  if (sub === "set") {
    const key = args[1];
    const rawVal = args.slice(2).join(" ");
    if (!key || rawVal === undefined || rawVal === "") {
      console.error("Error: Key and value required. Usage: pg config set <key> <value>");
      return 2;
    }

    setConfig(db, key, rawVal);
    console.log(`Set configuration: ${key} = ${rawVal}`);

    await sendCliEvent("config_changed", {
      key,
      value: rawVal
    });

    return 0;
  }

  if (sub === "reset") {
    resetConfig(db);
    console.log("Configuration reset to defaults.");
    await sendCliEvent("config_reset", {});
    return 0;
  }

  // Default: list all configuration keys and values
  const all = listConfig(db);
  console.log("Package Guard Configuration:\n");
  console.log("KEY                     VALUE");
  console.log("----------------------------------------");
  for (const [k, v] of Object.entries(all)) {
    console.log(`${k.padEnd(24)} ${v}`);
  }
  return 0;
}
