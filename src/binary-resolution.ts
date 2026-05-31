import { existsSync as defaultExistsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { posix, win32 } from "node:path";

const require = createRequire(import.meta.url);

export interface ResolveBundledBinDeps {
  resolvePackageJson?: (specifier: string) => string;
  readPackageJson?: (packageJsonPath: string) => string;
  existsSync?: (candidate: string) => boolean;
  platform?: NodeJS.Platform;
}

function defaultResolvePackageJson(specifier: string): string {
  return require.resolve(specifier);
}

function defaultReadPackageJson(packageJsonPath: string): string {
  return readFileSync(packageJsonPath, "utf8");
}

function binEntryFor(packageJsonText: string, binName: string): string | undefined {
  const parsed = JSON.parse(packageJsonText) as { bin?: string | Record<string, string> };
  if (typeof parsed.bin === "string") return parsed.bin;
  return parsed.bin?.[binName];
}

function commandCandidates(basePath: string, platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return [basePath];
  return [`${basePath}.exe`, basePath];
}

function firstExisting(candidates: string[], existsSync: (candidate: string) => boolean): string | undefined {
  return candidates.find((candidate) => existsSync(candidate));
}

function isWindowsAbsolutePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\");
}

function resolveBinPathFromPackageJson(packageJsonPath: string, binEntry: string): string {
  const path = isWindowsAbsolutePath(packageJsonPath) ? win32 : posix;
  return path.resolve(path.dirname(packageJsonPath), binEntry);
}

export interface ExecutableCommand {
  command: string;
  argsPrefix: string[];
}

export function executableCommand(binaryPath: string, platform: NodeJS.Platform = process.platform): ExecutableCommand {
  if (platform === "win32" && /\.js$/i.test(binaryPath)) {
    return { command: process.execPath, argsPrefix: [binaryPath] };
  }
  return { command: binaryPath, argsPrefix: [] };
}

export function resolveBundledBin(
  packageName: string,
  binName: string,
  fallbackCommand: string,
  deps: ResolveBundledBinDeps = {},
): string {
  const resolvePackageJson = deps.resolvePackageJson ?? defaultResolvePackageJson;
  const readPackageJson = deps.readPackageJson ?? defaultReadPackageJson;
  const existsSync = deps.existsSync ?? defaultExistsSync;
  const platform = deps.platform ?? process.platform;

  try {
    const packageJsonPath = resolvePackageJson(`${packageName}/package.json`);
    const binEntry = binEntryFor(readPackageJson(packageJsonPath), binName);
    if (!binEntry) return fallbackCommand;

    const absoluteBinPath = resolveBinPathFromPackageJson(packageJsonPath, binEntry);
    const packageBinCandidate = firstExisting(
      commandCandidates(absoluteBinPath, platform),
      existsSync,
    );
    if (packageBinCandidate) return packageBinCandidate;
  } catch {
    // Fall through to PATH fallback.
  }

  return fallbackCommand;
}
