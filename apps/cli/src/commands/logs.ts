import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { readLogEntries, clearLogFiles, parseLogLine } from "../services/log-service";
import { getLogsDir } from "@package-guard/shared/paths";

export async function executeLogs(
  _db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[]
): Promise<number> {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "clear") {
    const { cleared } = clearLogFiles();
    console.log(`Cleared ${cleared} log files.`);
    return 0;
  }

  if (sub === "error" || sub === "--error" || sub === "errors") {
    const entries = readLogEntries({ errorsOnly: true, limit: 100 });
    if (entries.length === 0) {
      console.log("No error log entries found.");
      return 0;
    }

    console.log(`Found ${entries.length} recent error entries:\n`);
    for (const e of entries) {
      console.log(`[${e.timestamp}] [${e.component.toUpperCase()}] ${e.message}`);
    }
    return 0;
  }

  if (sub === "live" || sub === "--live" || sub === "-f") {
    const logsDir = getLogsDir();
    console.log(`Streaming live logs from ${logsDir} (Press Ctrl+C to exit)...\n`);

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const files = fs.readdirSync(logsDir).filter((f) => f.endsWith(".log") || f.endsWith(".txt"));
    const activeFile = files.length > 0 ? path.join(logsDir, files[0]) : path.join(logsDir, "app.log");
    if (!fs.existsSync(activeFile)) {
      fs.writeFileSync(activeFile, "", "utf8");
    }

    let lastSize = fs.statSync(activeFile).size;

    const interval = setInterval(() => {
      try {
        const stat = fs.statSync(activeFile);
        if (stat.size > lastSize) {
          const stream = fs.createReadStream(activeFile, {
            start: lastSize,
            end: stat.size
          });
          stream.on("data", (chunk) => {
            const lines = chunk.toString("utf8").split("\n");
            for (const l of lines) {
              const parsed = parseLogLine(l);
              if (parsed) {
                console.log(`[${parsed.timestamp}] [${parsed.level.toUpperCase()}] [${parsed.component}] ${parsed.message}`);
              }
            }
          });
          lastSize = stat.size;
        }
      } catch {
        // file may be momentarily locked
      }
    }, 1000);

    // Keep process open until interrupted
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        clearInterval(interval);
        resolve();
      });
    });

    return 0;
  }

  // Default: show recent structured logs
  const limit = 50;
  const entries = readLogEntries({ limit });
  if (entries.length === 0) {
    console.log("No recent log entries found.");
    return 0;
  }

  console.log(`Recent Log Entries (last ${entries.length}):\n`);
  for (const e of entries) {
    console.log(`[${e.timestamp}] [${e.level.toUpperCase().padEnd(5)}] [${e.component}] ${e.message}`);
  }
  return 0;
}
