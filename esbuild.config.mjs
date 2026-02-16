import * as esbuild from "esbuild";
import { createServer } from "http";
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join, extname } from "path";

const isProd = !process.argv.includes("--dev");
const isServe = process.argv.includes("--serve");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serve(dir, port) {
  createServer((req, res) => {
    const url = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const file = join(dir, url);
    try {
      const data = readFileSync(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch {
      // SPA fallback
      const html = readFileSync(join(dir, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
  }).listen(port, () => console.log(`Serving on http://localhost:${port}`));
}

async function build() {
  if (existsSync("dist")) rmSync("dist", { recursive: true });
  mkdirSync("dist/assets", { recursive: true });

  const opts = {
    entryPoints: ["src/main.jsx"],
    bundle: true,
    outdir: "dist/assets",
    format: "esm",
    platform: "browser",
    splitting: true,
    jsx: "automatic",
    minify: isProd,
    sourcemap: !isProd,
    metafile: true,
    entryNames: isProd ? "[name]-[hash]" : "[name]",
    chunkNames: isProd ? "chunk-[hash]" : "[name]",
    define: {
      "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
    },
  };

  if (isServe) {
    const ctx = await esbuild.context(opts);
    const result = await ctx.rebuild();
    writeHtml(result);
    const { port } = await ctx.serve({ servedir: "dist", port: 5173 });
    console.log(`Dev server: http://localhost:${port}`);
  } else {
    const result = await esbuild.build(opts);
    writeHtml(result);
    const text = await esbuild.analyzeMetafile(result.metafile, {
      verbose: false,
    });
    console.log(text);
    serve("dist", 8080);
  }
}

function writeHtml(result) {
  const entry = Object.keys(result.metafile.outputs).find(
    (f) => /main.*\.js$/.test(f) && !f.endsWith(".map"),
  );
  const src = entry.replace("dist/", "");
  writeFileSync(
    "dist/index.html",
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ACB Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${src}"></script>
  </body>
</html>
`,
  );
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
