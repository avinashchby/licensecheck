import type { LicenseCategory } from "./types";

const PERMISSIVE_LICENSES = new Set([
  "mit",
  "apache-2.0",
  "bsd-2-clause",
  "bsd-3-clause",
  "isc",
  "0bsd",
  "unlicense",
  "cc0-1.0",
  "zlib",
  "bsl-1.0",
  "psf-2.0",
  "python-2.0",
]);

const COPYLEFT_LICENSES = new Set([
  "gpl-2.0",
  "gpl-3.0",
  "agpl-3.0",
  "lgpl-2.1",
  "lgpl-3.0",
  "mpl-2.0",
  "eupl-1.2",
  "gpl-2.0-only",
  "gpl-2.0-or-later",
  "gpl-3.0-only",
  "gpl-3.0-or-later",
  "agpl-3.0-only",
  "agpl-3.0-or-later",
]);

/** Map of common non-standard license strings to their SPDX equivalents. */
const NORMALIZATIONS: Record<string, string> = {
  "apache 2.0": "Apache-2.0",
  "apache2": "Apache-2.0",
  "apache 2": "Apache-2.0",
  "bsd": "BSD-3-Clause",
  "bsd2": "BSD-2-Clause",
  "bsd3": "BSD-3-Clause",
  "gpl": "GPL-3.0",
  "gpl2": "GPL-2.0",
  "gpl3": "GPL-3.0",
  "lgpl": "LGPL-2.1",
  "mit/x11": "MIT",
  "public domain": "Unlicense",
};

/** Normalize a common non-SPDX variant to its canonical SPDX form, or return as-is. */
function applyNormalizationMap(s: string): string {
  return NORMALIZATIONS[s.toLowerCase()] ?? s;
}

/** Strip surrounding parentheses from an SPDX expression if present. */
function stripParens(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Classify a single, atomic (non-compound) SPDX identifier. */
function classifyAtom(id: string): LicenseCategory {
  const lower = id.trim().toLowerCase();
  if (lower === "" || lower === "unknown" || lower === "unlicensed") {
    return "unknown";
  }
  if (PERMISSIVE_LICENSES.has(lower)) return "permissive";
  if (COPYLEFT_LICENSES.has(lower)) return "copyleft";
  return "unknown";
}

/** Resolve precedence: copyleft > unknown > permissive (most restrictive wins). */
function mostRestrictive(a: LicenseCategory, b: LicenseCategory): LicenseCategory {
  const rank: Record<LicenseCategory, number> = {
    permissive: 0,
    unknown: 1,
    copyleft: 2,
    custom: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

/** Resolve precedence for OR: permissive > unknown > copyleft (most permissive wins). */
function mostPermissive(a: LicenseCategory, b: LicenseCategory): LicenseCategory {
  const rank: Record<LicenseCategory, number> = {
    copyleft: 0,
    unknown: 1,
    permissive: 2,
    custom: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

/** Detect a custom license reference such as "SEE LICENSE IN ...". */
function isCustomLicense(s: string): boolean {
  return /^see\s+license\s+in\b/i.test(s.trim());
}

/** Classify an SPDX expression that may contain OR / AND operators. */
function classifyExpression(expr: string): LicenseCategory {
  const unwrapped = stripParens(expr);

  if (isCustomLicense(unwrapped)) return "custom";

  // Handle OR — most permissive wins.
  if (/\bOR\b/.test(unwrapped)) {
    return unwrapped
      .split(/\bOR\b/)
      .map((part) => classifyExpression(part.trim()))
      .reduce(mostPermissive);
  }

  // Handle AND — most restrictive wins.
  if (/\bAND\b/.test(unwrapped)) {
    return unwrapped
      .split(/\bAND\b/)
      .map((part) => classifyExpression(part.trim()))
      .reduce(mostRestrictive);
  }

  return classifyAtom(unwrapped);
}

/**
 * Normalize a raw license string to a canonical form.
 * Trims whitespace, applies known alias mappings, and strips outer parentheses
 * from simple single-token expressions.
 */
export function normalizeLicense(raw: string | undefined | null): string {
  if (raw == null) return "UNKNOWN";
  const trimmed = raw.trim();
  if (trimmed === "") return "UNKNOWN";
  const mapped = applyNormalizationMap(trimmed);
  return mapped;
}

/**
 * Classify a license string into a LicenseCategory.
 * Handles SPDX expressions with OR (most permissive wins) and AND
 * (most restrictive wins), common aliases, and custom license references.
 */
export function classifyLicense(license: string | undefined | null): LicenseCategory {
  if (license == null) return "unknown";
  const trimmed = license.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "UNKNOWN" || trimmed.toUpperCase() === "UNLICENSED") {
    return "unknown";
  }
  if (isCustomLicense(trimmed)) return "custom";
  const normalized = applyNormalizationMap(trimmed);
  return classifyExpression(normalized);
}
