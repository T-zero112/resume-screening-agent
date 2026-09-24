import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-screening-installer-"));

try {
  const { Arch, build, Platform } = await import("electron-builder");
  await build({
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
    config: {
      ...packageJson.build,
      directories: { ...packageJson.build.directories, output: outputDirectory },
    },
  });
  const installerName = (await readdir(outputDirectory)).find((name) => /^Resume-Screening-Agent-Setup-.*\.exe$/i.test(name));
  if (!installerName) throw new Error("electron-builder 未生成 Windows 安装程序。");
  const releaseDirectory = path.join(projectRoot, "release");
  await mkdir(releaseDirectory, { recursive: true });
  await copyFile(path.join(outputDirectory, installerName), path.join(releaseDirectory, installerName));
  process.stdout.write(`Windows 安装程序已生成：${path.join(releaseDirectory, installerName)}\n`);
} finally {
  const tempRoot = path.resolve(os.tmpdir());
  if (!outputDirectory.startsWith(`${tempRoot}${path.sep}`)) throw new Error("拒绝清理临时目录之外的路径。");
  await rm(outputDirectory, { recursive: true, force: true });
}
