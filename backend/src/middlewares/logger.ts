import winston from "winston";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "..", "..", "logs");

const isProd = process.env.NODE_ENV === "production";
const level =
  process.env.LOG_LEVEL ??
  (isProd ? "info" : "debug");

const consoleFormat = isProd
  ? winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    )
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const rest = Object.keys(meta).length
          ? `\n${JSON.stringify(meta, null, 2)}`
          : "";
        return `${String(timestamp)} [${level}]: ${String(message)}${rest}`;
      }),
    );

/** Single-line `app.log`: `date YYYY-MM-DD HH:mm:ss.SSS …` (local date+time, flattened meta, no JSON). */
function fileDateTimeLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}.${ms}`;
}

function encodePlainLogValue(s: string): string {
  const oneLine = s.replace(/\r?\n/g, " ").trim();
  if (/[\s"]/.test(oneLine)) {
    return `"${oneLine.replace(/"/g, '\\"')}"`;
  }
  return oneLine;
}

function flattenMetaPlain(
  data: unknown,
  prefix = "",
): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  if (data === null || data === undefined) {
    if (prefix) out.push({ key: prefix, value: "" });
    return out;
  }
  if (
    typeof data === "string" ||
    typeof data === "number" ||
    typeof data === "boolean"
  ) {
    if (prefix) out.push({ key: prefix, value: String(data) });
    return out;
  }
  if (typeof data === "bigint") {
    if (prefix) out.push({ key: prefix, value: String(data) });
    return out;
  }
  if (data instanceof Date) {
    if (prefix) out.push({ key: prefix, value: data.toISOString() });
    return out;
  }
  if (Array.isArray(data)) {
    if (!prefix) return out;
    const primitive = data.every(
      (item) =>
        item === null ||
        item === undefined ||
        ["string", "number", "boolean", "bigint"].includes(typeof item),
    );
    if (primitive) {
      out.push({
        key: prefix,
        value: data.map((item) => String(item)).join(","),
      });
    } else {
      out.push({
        key: prefix,
        value: data
          .map((item) =>
            item !== null &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            !(item instanceof Date)
              ? "[object]"
              : String(item),
          )
          .join("|"),
      });
    }
    return out;
  }
  if (typeof data === "object") {
    try {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        const next = prefix ? `${prefix}_${k}` : k;
        if (v === null || v === undefined) {
          out.push({ key: next, value: "" });
        } else {
          out.push(...flattenMetaPlain(v, next));
        }
      }
    } catch {
      if (prefix) out.push({ key: prefix, value: "[unserializable]" });
    }
  }
  return out;
}

const filePlainFormat = winston.format.combine(
  winston.format.timestamp({ format: fileDateTimeLocal }),
  winston.format.printf((info) => {
    const dateTime = String(info.timestamp ?? "");
    const lvl = String(info.level);
    const message = String(info.message ?? "");
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(info)) {
      if (
        k === "timestamp" ||
        k === "level" ||
        k === "message" ||
        k === "splat"
      ) {
        continue;
      }
      rest[k] = v;
    }
    const pairs = flattenMetaPlain(
      Object.keys(rest).length ? rest : undefined,
    )
      .map(({ key, value }) => `${key}=${encodePlainLogValue(value)}`)
      .join(" ");
    const tail = pairs ? ` ${pairs}` : "";
    return `${dateTime} ${lvl}: ${message}${tail}\n`;
  }),
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

if (process.env.LOG_DISABLE_FILE !== "true") {
  try {
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, "app.log"),
        format: filePlainFormat,
      }),
    );
  } catch {
    // e.g. read-only filesystem — console only
  }
}

export const logger = winston.createLogger({
  level,
  transports,
});

let processErrorLoggingAttached = false;

export function attachProcessErrorLogging(): void {
  if (processErrorLoggingAttached) {
    return;
  }
  processErrorLoggingAttached = true;

  process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", {
      message: err.message,
      stack: err.stack,
    });
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
