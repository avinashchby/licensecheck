import { DependencyInfo, CompatibilityResult, CliOptions, AuditReport } from './types.js';
import { classifyLicense } from './classifier.js';

/** Licenses considered permissive (compatible with everything as a project license). */
const PERMISSIVE_LICENSES = new Set([
  'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0',
  'Unlicense', '0BSD', 'WTFPL', 'CC0-1.0',
]);

/** Licenses considered strong copyleft (GPL family). */
const STRONG_COPYLEFT_LICENSES = new Set([
  'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
]);

/** Licenses that are weak copyleft and warrant a warning (library use). */
const WEAK_COPYLEFT_LICENSES = new Set([
  'LGPL-2.0', 'LGPL-2.0-only', 'LGPL-2.0-or-later',
  'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
  'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
]);

/** Licenses that are file-level copyleft and warrant a warning. */
const FILE_COPYLEFT_LICENSES = new Set(['MPL-2.0']);

/** Returns true if the project license is permissive. */
function isPermissiveProject(projectLicense: string): boolean {
  const normalized = projectLicense.trim().toUpperCase();
  for (const lic of PERMISSIVE_LICENSES) {
    if (lic.toUpperCase() === normalized) return true;
  }
  return false;
}

/** Resolve compatibility for a dep whose license matches a deny list entry. */
function denyListResult(dep: DependencyInfo): CompatibilityResult {
  return {
    dependency: dep,
    compatible: false,
    reason: `License "${dep.license}" is on the deny list.`,
  };
}

/** Resolve compatibility for a dep whose license matches an allow list entry. */
function allowListResult(dep: DependencyInfo): CompatibilityResult {
  return {
    dependency: dep,
    compatible: true,
    reason: `License "${dep.license}" is on the allow list.`,
  };
}

/** Evaluate compatibility based solely on license rules (no allow/deny override). */
function evaluateByRules(
  projectLicense: string,
  dep: DependencyInfo,
): CompatibilityResult {
  const { license } = dep;
  const category = classifyLicense(license);

  if (category === 'unknown') {
    return {
      dependency: dep,
      compatible: true,
      reason: `License "${license}" is unknown; manual review required.`,
    };
  }

  if (category === 'custom') {
    return {
      dependency: dep,
      compatible: true,
      reason: `License "${license}" is a custom license; manual review required.`,
    };
  }

  if (WEAK_COPYLEFT_LICENSES.has(license)) {
    return {
      dependency: dep,
      compatible: true,
      reason: `License "${license}" is LGPL; compatible when used as a dynamically linked library, but review required.`,
    };
  }

  if (FILE_COPYLEFT_LICENSES.has(license)) {
    return {
      dependency: dep,
      compatible: true,
      reason: `License "${license}" is file-level copyleft (MPL-2.0); compatible but review required.`,
    };
  }

  if (STRONG_COPYLEFT_LICENSES.has(license) && isPermissiveProject(projectLicense)) {
    return {
      dependency: dep,
      compatible: false,
      reason: `License "${license}" is strong copyleft and incompatible with permissive project license "${projectLicense}".`,
    };
  }

  // Permissive dep or copyleft-on-copyleft project — compatible.
  return {
    dependency: dep,
    compatible: true,
    reason: `License "${license}" is compatible with project license "${projectLicense}".`,
  };
}

/** Returns true if the result should be treated as a warning rather than a hard conflict. */
function isWarning(result: CompatibilityResult): boolean {
  if (!result.compatible) return false;
  const { license } = result.dependency;
  const category = classifyLicense(license);
  return (
    category === 'unknown' ||
    category === 'custom' ||
    WEAK_COPYLEFT_LICENSES.has(license) ||
    FILE_COPYLEFT_LICENSES.has(license)
  );
}

/**
 * Check if a single dependency is compatible with the project license.
 *
 * Allow and deny lists take precedence over default rules.
 * Deny list is checked first.
 */
export function checkSingleCompatibility(
  projectLicense: string,
  dep: DependencyInfo,
  allowList: string[],
  denyList: string[],
): CompatibilityResult {
  if (denyList.includes(dep.license)) {
    return denyListResult(dep);
  }
  if (allowList.includes(dep.license)) {
    return allowListResult(dep);
  }
  return evaluateByRules(projectLicense, dep);
}

/** Build the license distribution map from a list of dependencies. */
function buildDistribution(dependencies: DependencyInfo[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const dep of dependencies) {
    dist[dep.license] = (dist[dep.license] ?? 0) + 1;
  }
  return dist;
}

/**
 * Check compatibility of all dependencies against the project license.
 *
 * Returns a full AuditReport with conflicts, warnings, and distribution counts.
 * User-provided allow/deny lists override default compatibility rules.
 */
export function checkCompatibility(
  projectLicense: string,
  dependencies: DependencyInfo[],
  options: Pick<CliOptions, 'allow' | 'deny'>,
): AuditReport {
  const allowList = options.allow ?? [];
  const denyList = options.deny ?? [];

  const conflicts: CompatibilityResult[] = [];
  const warnings: CompatibilityResult[] = [];

  for (const dep of dependencies) {
    const result = checkSingleCompatibility(projectLicense, dep, allowList, denyList);
    if (!result.compatible) {
      conflicts.push(result);
    } else if (isWarning(result)) {
      warnings.push(result);
    }
  }

  return {
    projectLicense,
    totalDependencies: dependencies.length,
    distribution: buildDistribution(dependencies),
    conflicts,
    warnings,
    allDependencies: dependencies,
  };
}
