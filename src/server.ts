import "dotenv/config";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJobApiMiddleware } from "./jobs/job-api.js";
import { startEmailPolling } from "./mail/email-inbox.js";
import { startArchiveRetention } from "./mail/resume-archive.js";

const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export function startLocalServer(options: { storeSecrets?: (secrets: Record<string, string>) => Promise<void> } = {}): Promise<Server> {
  const apiMiddleware = createJobApiMiddleware(options);
  const server = createServer((request, response) => {
    void apiMiddleware(request, response, () => {
      void serveStaticFile(request.url ?? "/", request.method ?? "GET", response);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const stopPolling = startEmailPolling();
      const stopArchiveRetention = startArchiveRetention();
      server.once("close", stopPolling);
      server.once("close", stopArchiveRetention);
      resolve(server);
    });
  });
}

async function serveStaticFile(url: string, method: string, response: import("node:http").ServerResponse): Promise<void> {
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const requestedFile = pathname === "/" ? path.join(staticRoot, "index.html") : path.resolve(staticRoot, `.${pathname}`);
  if (requestedFile !== staticRoot && !requestedFile.startsWith(`${staticRoot}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  const fileExists = await stat(requestedFile).then((metadata) => metadata.isFile()).catch(() => false);
  const file = fileExists ? requestedFile : path.extname(pathname) ? undefined : path.join(staticRoot, "index.html");
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("Content-Type", contentTypes[path.extname(file)] ?? "application/octet-stream");
  if (method === "HEAD") {
    response.writeHead(200).end();
    return;
  }
  createReadStream(file).on("error", () => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  }).pipe(response);
}
