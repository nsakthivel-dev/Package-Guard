import type BetterSqlite3 from "better-sqlite3";
import { getConfig, setConfig, resetConfig, listConfig } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";
import { outputSuccess, outputError } from "../output";

export async function executeConfig(
  db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[],
  isJson: boolean = false
): Promise<number> {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "get") {
    const key = args[1];
    if (!key) {
      if (isJson) {
        outputError("Key required. Usage: pg config get <key>", "INVALID_ARGUMENT");
      } else {
        console.error("Error: Key required. Usage: pg config get <key>");
      }
      return 2;
    }
    const val = getConfig(db, key);
    if (val === undefined) {
      if (isJson) {
        outputSuccess({ key, value: null, isSet: false });
      } else {
        console.log(`(not set)`);
      }
      return 1;
    }
    if (isJson) {
      outputSuccess({ key, value: val, isSet: true });
    } else {
      console.log(`${key} = ${val}`);
    }
    return 0;
  }

  if (sub === "set") {
    const key = args[1];
    const rawVal = args.slice(2).join(" ");
    if (!key || rawVal === undefined || rawVal === "") {
      if (isJson) {
        outputError("Key and value required. Usage: pg config set <key> <value>", "INVALID_ARGUMENT");
      } else {
        console.error("Error: Key and value required. Usage: pg config set <key> <value>");
      }
      return 2;
    }

    setConfig(db, key, rawVal);
    await sendCliEvent("config_changed", {
      key,
      value: rawVal
    });

    if (isJson) {
      outputSuccess({ key, value: rawVal });
      return 0;
    }

    console.log(`Set configuration: ${key} = ${rawVal}`);
    return 0;
  }

  if (sub === "reset") {
    resetConfig(db);
    await sendCliEvent("config_reset", {});
    if (isJson) {
      outputSuccess({ reset: true });
      return 0;
    }
    console.log("Configuration reset to defaults.");
    return 0;
  }

  // Default: list all configuration keys and values
  const all = listConfig(db);
  if (isJson) {
    outputSuccess(all);
    return 0;
  }

  console.log("Package Guardian Configuration:\n");
  console.log("KEY                     VALUE");
  console.log("----------------------------------------");
  for (const [k, v] of Object.entries(all)) {
    console.log(`${k.padEnd(24)} ${v}`);
  }
  return 0;
}
