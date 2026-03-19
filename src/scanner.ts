import { promises as fs } from "fs";
import * as path from "path";
import type { DependencyInfo } from "./types.js";

/** Shape of the fields we care about in any package.json. */
interface PackageJson {
  name?: string;
  version?: string;
  license?: string | { type: string };
  licenses?: Array<{ type: string }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Read and parse a package.json file; returns null on any error. */
async function readPackageJson(pkgPath: string): Promise<PackageJson | null> {
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Extract a normalised SPDX-ish license string from a parsed package.json.
 * Falls back to "UNLICENSED" when nothing useful is found.
 */
function extractLicenseField(pkg: PackageJson): string {
  if (pkg.license) {
    if (typeof pkg.license === "string") return pkg.license || "UNLICENSED";
    if (typeof pkg.license === "object" && pkg.license.type) {
      return pkg.license.type;
    }
  }
  // Legacy `licenses` array (npm < 2 format)
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses.map((l) => l.type).filter(Boolean).join(" OR ") || "UNLICENSED";
  }
  return "UNLICENSED";
}

/**
 * Look for a LICENSE / LICENCE file inside `dir` and return the first
 * filename found, or null when none exists.
 */
async function findLicenseFile(dir: string): Promise<string | null> {
  const candidates = [
    "LICENSE",
    "LICENCE",
    "LICENSE.md",
    "LICENCE.md",
    "LICENSE.txt",
    "LICENCE.txt",
  ];
  for (const name of candidates) {
    try {
      await fs.access(path.join(dir, name));
      return name;
    } catch {
      // not found — try next
    }
  }
  return null;
}

/**
 * Resolve the license for a single package directory.
 * Reads package.json first; if the license is absent or UNLICENSED it also
 * checks for a LICENSE file so that the result is "LICENSE file" rather than
 * "UNLICENSED" when the author just forgot to set the field.
 */
async function resolveLicense(pkgDir: string): Promise<{ license: string; pkg: PackageJson | null }> {
  const pkg = await readPackageJson(path.join(pkgDir, "package.json"));
  if (!pkg) return { license: "UNKNOWN", pkg: null };

  const license = extractLicenseField(pkg);
  if (license !== "UNLICENSED") return { license, pkg };

  // No license field — check for a LICENSE file as a fallback indicator
  const licFile = await findLicenseFile(pkgDir);
  return { license: licFile ? "LICENSE file" : "UNLICENSED", pkg };
}

/** Queue entry used during the breadth-first walk of node_modules. */
interface QueueEntry {
  /** Absolute path to the package directory. */
  dir: string;
  /** Dependency chain leading to this package (names only). */
  dependencyPath: string[];
}

/**
 * List the immediate sub-packages inside a node_modules directory.
 * Handles scoped packages (@scope/pkg) transparently.
 */
async function listNodeModules(nodeModulesDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(nodeModulesDir);
  } catch {
    return [];
  }

  const pkgDirs: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      // Scoped — one more level
      const scopeDir = path.join(nodeModulesDir, entry);
      let scoped: string[];
      try {
        scoped = await fs.readdir(scopeDir);
      } catch {
        continue;
      }
      for (const s of scoped) {
        pkgDirs.push(path.join(scopeDir, s));
      }
    } else {
      pkgDirs.push(path.join(nodeModulesDir, entry));
    }
  }
  return pkgDirs;
}

/**
 * Breadth-first walk over all node_modules trees starting from `rootDir`.
 * Returns one DependencyInfo per unique (name@version) pair encountered.
 */
async function walkNodeModules(
  rootDir: string,
  production: boolean,
  rootPkg: PackageJson
): Promise<DependencyInfo[]> {
  const seen = new Set<string>(); // "name@version"
  const results: DependencyInfo[] = [];

  // Seed the queue with the direct dependencies declared in the root package
  const directDeps = new Set<string>(Object.keys(rootPkg.dependencies ?? {}));
  if (!production) {
    for (const d of Object.keys(rootPkg.devDependencies ?? {})) directDeps.add(d);
  }

  const queue: QueueEntry[] = [];
  const rootNm = path.join(rootDir, "node_modules");
  for (const dep of directDeps) {
    const depDir = path.join(rootNm, dep);
    queue.push({ dir: depDir, dependencyPath: [] });
  }

  while (queue.length > 0) {
    const { dir: pkgDir, dependencyPath } = queue.shift()!;

    const { license, pkg } = await resolveLicense(pkgDir);
    if (!pkg) continue;

    const name = pkg.name ?? path.basename(pkgDir);
    const version = pkg.version ?? "unknown";
    const key = `${name}@${version}`;

    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      name,
      version,
      license,
      category: "unknown", // categorisation is handled by the classifier module
      dependencyPath,
    });

    // Enqueue transitive deps — prefer nested node_modules, then fall back
    // to the root-level node_modules (hoisted by npm/yarn).
    const nestedNm = path.join(pkgDir, "node_modules");
    const transitive = Object.keys(pkg.dependencies ?? {});
    for (const dep of transitive) {
      const nested = path.join(nestedNm, dep);
      const hoisted = path.join(rootNm, dep);
      const candidate = (await dirExists(nested)) ? nested : hoisted;
      queue.push({ dir: candidate, dependencyPath: [...dependencyPath, name] });
    }
  }

  return results;
}

/** Returns true when `dir` is an accessible directory. */
async function dirExists(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Scan all dependencies (direct and transitive) of the project located at
 * `projectDir`.
 *
 * @param projectDir - Absolute path to the root of the project to audit.
 * @param production - When `true`, devDependencies declared in the root
 *   package.json are excluded from the walk.
 * @returns The project's own SPDX license string and a flat list of
 *   `DependencyInfo` objects — one per unique `name@version` found.
 */
export async function scanDependencies(
  projectDir: string,
  production: boolean
): Promise<{ projectLicense: string; dependencies: DependencyInfo[] }> {
  const rootPkg = await readPackageJson(path.join(projectDir, "package.json"));
  if (!rootPkg) {
    throw new Error(`No package.json found in ${projectDir}`);
  }

  const projectLicense = extractLicenseField(rootPkg);
  const dependencies = await walkNodeModules(projectDir, production, rootPkg);

  return { projectLicense, dependencies };
}
