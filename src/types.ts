/** Classification categories for licenses. */
export type LicenseCategory = "permissive" | "copyleft" | "unknown" | "custom";

/** A single dependency with its resolved license info. */
export interface DependencyInfo {
  name: string;
  version: string;
  license: string;
  category: LicenseCategory;
  /** Chain of packages that require this dependency. */
  dependencyPath: string[];
}

/** Result of a compatibility check for one dependency. */
export interface CompatibilityResult {
  dependency: DependencyInfo;
  compatible: boolean;
  reason: string;
}

/** Aggregated audit report. */
export interface AuditReport {
  projectLicense: string;
  totalDependencies: number;
  distribution: Record<string, number>;
  conflicts: CompatibilityResult[];
  warnings: CompatibilityResult[];
  allDependencies: DependencyInfo[];
}

/** CLI options parsed from commander. */
export interface CliOptions {
  summary: boolean;
  conflicts: boolean;
  allow: string[];
  deny: string[];
  ci: boolean;
  json: boolean;
  tree: boolean;
  production: boolean;
}
