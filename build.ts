#!/usr/bin/env bun
import plugin from "bun-plugin-tailwind";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import path from "path";

// Define entrypoints as constants
const FRONTEND_ENTRYPOINT = "./src/frontend/index.html";

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

async function buildGoLib() {
  console.log("🔨 Building Go library...");
  const goDir = path.join(process.cwd(), "go-lib-ffi");

  if (!existsSync(goDir)) {
    console.log("⚠️  Go library directory not found, skipping");
    return;
  }

  try {
    const proc = Bun.spawn({
      cmd: ["make", "build"],
      cwd: goDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    if (exitCode === 0) {
      console.log("✅ Go library built successfully");
    } else {
      console.error("❌ Go library build failed");
      const stderr = await new Response(proc.stderr).text();
      console.error(stderr);
    }
  } catch (error) {
    console.error("❌ Error building Go library:", error);
  }
}

console.log("\n🚀 Starting build process...\n");

// Build Go library first
await buildGoLib();

const outdir = path.join(process.cwd(), "dist");

if (existsSync(outdir)) {
  console.log(`🗑️ Cleaning previous build at ${outdir}`);
  await rm(outdir, { recursive: true, force: true });
}

const start = performance.now();

const result = await Bun.build({
  entrypoints: [FRONTEND_ENTRYPOINT],
  outdir,
  plugins: [plugin],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

const end = performance.now();

const outputTable = result.outputs.map((output) => ({
  File: path.relative(process.cwd(), output.path),
  Type: output.kind,
  Size: formatFileSize(output.size),
}));

console.table(outputTable);
const buildTime = (end - start).toFixed(2);

console.log(`\n✅ Build completed in ${buildTime}ms\n`);
