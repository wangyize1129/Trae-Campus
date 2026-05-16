import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname);
const port = Number(process.env.PORT ?? 8080);

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const p = decoded === "/" ? "/index.html" : decoded;
  const abs = path.resolve(root, `.${p}`);
  if (!abs.startsWith(root)) return null;
  return abs;
}

async function readFileIfExists(absPath) {
  try {
    const data = await fs.readFile(absPath);
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}

const server = http.createServer(async (req, res) => {
  const abs = safePath(req.url || "/");
  if (!abs) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  const ext = path.extname(abs).toLowerCase();
  const direct = await readFileIfExists(abs);
  if (direct.ok) {
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME.get(ext) ?? "application/octet-stream");
    res.end(direct.data);
    return;
  }

  const indexAbs = path.resolve(root, "./index.html");
  const index = await readFileIfExists(indexAbs);
  if (index.ok) {
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME.get(".html"));
    res.end(index.data);
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`http://127.0.0.1:${port}/\n`);
});

