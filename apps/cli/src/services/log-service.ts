import * as fs from "node:fs";
import * as path from "node:path";
import { getLogsDir } from "@package-guard/shared/paths";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  component: string;
  message: string;
  raw: string;
}

export function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try JSON log format
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        timestamp: parsed.timestamp || parsed.time || new Date().toISOString(),
        level: (parsed.level || "info").toLowerCase(),
        component: parsed.component || parsed.module || "core",
        message: parsed.message || parsed.msg || trimmed,
        raw: trimmed
      };
    } catch {
      // fallback
    }
  }

  // Common text log format: [2026-09-28T...] [LEVEL] [COMPONENT] message
  const match = trimmed.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[?([^\]]*)\]?\s*(.*)$/);
  if (match) {
    const levelRaw = match[2].toLowerCase();
    const level = levelRaw.includes("err") ? "error" : levelRaw.includes("warn") ? "warn" : "info";
    return {
      timestamp: match[1],
      level,
      component: match[3] || "system",
      message: match[4] || trimmed,
      raw: trimmed
    };
  }

  return {
    timestamp: new Date().toISOString(),
    level: trimmed.toLowerCase().includes("err") ? "error" : "info",
    component: "system",
    message: trimmed,
    raw: trimmed
  };
}

export function readLogEntries(options: { errorsOnly?: boolean; limit?: number } = {}): LogEntry[] {
  const logsDir = getLogsDir();
  const entries: LogEntry[] = [];

  if (!fs.existsSync(logsDir)) {
    return entries;
  }

  try {
    const files = fs.readdirSync(logsDir).filter((f) => f.endsWith(".log") || f.endsWith(".txt"));
    // Read most recent files first
    files.sort((a, b) => {
      try {
        return fs.statSync(path.join(logsDir, b)).mtimeMs - fs.statSync(path.join(logsDir, a)).mtimeMs;
      } catch {
        return 0;
      }
    });

    for (const f of files.slice(0, 3)) {
      const fullPath = path.join(logsDir, f);
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          const entry = parseLogLine(line);
          if (entry) {
            if (options.errorsOnly && entry.level !== "error") continue;
            entries.push(entry);
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // Return newest entries first
  entries.reverse();
  const limit = options.limit || 50;
  return entries.slice(0, limit);
}

export function clearLogFiles(): { cleared: number } {
  const logsDir = getLogsDir();
  let cleared = 0;

  if (fs.existsSync(logsDir)) {
    try {
      const files = fs.readdirSync(logsDir);
      for (const f of files) {
        const fullPath = path.join(logsDir, f);
        try {
          fs.truncateSync(fullPath, 0);
          cleared++;
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  return { cleared };
}
