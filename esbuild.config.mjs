import * as esbuild from "esbuild";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "fs";

const isProd = !process.argv.includes("--dev");

async function build() {
  if (existsSync("dist")) rmSync("dist", { recursive: true });
  mkdirSync("dist/assets", { recursive: true });

  const result = await esbuild.build({
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
  });

  writeHtml(result);
  const text = await esbuild.analyzeMetafile(result.metafile, {
    verbose: false,
  });
  console.log(text);
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
