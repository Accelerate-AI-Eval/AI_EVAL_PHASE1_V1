import type { NextFunction, Request, Response } from "express";
import geoip from "geoip-lite";
import * as os from "node:os";
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import { UAParser } from "ua-parser-js";
import { logger } from "./logger.js";

/** Avoid duplicate access lines if this middleware runs more than once for the same request. */
const accessLogHooked = Symbol("accessLogHooked");

const REDACT_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "proxy-authorization",
]);

function headerValueToString(
  val: string | number | string[] | readonly string[] | undefined,
): string {
  if (val === undefined) return "";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

function sanitizeHeaders(
  headers: IncomingHttpHeaders | OutgoingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (!key) continue;
    const lower = key.toLowerCase();
    out[key] = REDACT_HEADER_KEYS.has(lower)
      ? "[REDACTED]"
      : headerValueToString(val as string | string[] | undefined);
  }
  return out;
}

function stripIpv4MappedIpv6(ip: string): string {
  const m = /^::ffff:(.+)$/i.exec(ip.trim());
  return m ? m[1] : ip.trim();
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return stripIpv4MappedIpv6(first);
  }
  return stripIpv4MappedIpv6(req.socket.remoteAddress ?? "unknown");
}

function detectClientType(userAgent: string): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("postman")) return "Postman";
  if (ua.includes("curl")) return "cURL";
  if (ua.includes("insomnia")) return "Insomnia";
  if (ua.includes("node-fetch") || ua.includes("axios")) return "API Client";
  if (ua.includes("mozilla")) return "Browser";
  return "Other";
}

function getPreferredServerIp(): string | null {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      const fam = net.family;
      const isV4 =
        fam === "IPv4" ||
        (typeof fam === "number" && fam === 4);
      if (isV4 && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const serverIp = getPreferredServerIp();

function parseClient(userAgent: string, ip: string) {
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const clientOs = parser.getOS();
  const browserStr = [browser.name ?? "Unknown", browser.version ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const osStr = [clientOs.name ?? "Unknown", clientOs.version ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  let type = detectClientType(userAgent);
  if (type === "Other" && browser.name) {
    type = "Browser";
  }

  return {
    browser: browserStr || "Unknown",
    ip,
    os: osStr || "Unknown",
    type,
    userAgent,
  };
}

export default function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if ((req as Request & { [accessLogHooked]?: true })[accessLogHooked]) {
    next();
    return;
  }
  (req as Request & { [accessLogHooked]?: true })[accessLogHooked] = true;

  const start = Date.now();
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"] ?? "";
  const geoIpInput = stripIpv4MappedIpv6(ip.split("%")[0] ?? ip);
  const geo = geoip.lookup(geoIpInput);
  const client = parseClient(userAgent, ip);
  const requestHeaders = sanitizeHeaders(req.headers);

  res.once("finish", () => {
    const responseTime = `${Date.now() - start}ms`;
    const status = res.statusCode;
    const responseHeaders = sanitizeHeaders(res.getHeaders());

    const payload = {
      method: req.method,
      url: req.originalUrl,
      status,
      responseTime,
      client,
      location: {
        city: geo?.city ?? null,
        country: geo?.country ?? null,
        lat: geo?.ll?.[0] ?? null,
        lon: geo?.ll?.[1] ?? null,
        state: geo?.region ?? null,
      },
      server: {
        hostname: os.hostname(),
        ip: serverIp,
      },
      headers: {
        request: requestHeaders,
        response: responseHeaders,
      },
    };

    const summary = `API ${req.method} ${req.originalUrl} ${status} ${responseTime}`;

    if (status >= 500) {
      logger.error(summary, payload);
    } else if (status >= 400) {
      logger.warn(summary, payload);
    } else {
      logger.info(summary, payload);
    }
  });

  next();
}
