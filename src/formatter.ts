import chalk from 'chalk';
import { AuditReport, CliOptions, CompatibilityResult, DependencyInfo } from './types.js';

/** Format the audit report based on CLI options. */
export function formatReport(report: AuditReport, options: CliOptions): string {
  if (options.json) {
    return formatJson(report);
  }
  if (options.summary) {
    return formatSummaryOnly(report);
  }
  if (options.conflicts) {
    return formatConflictsOnly(report);
  }
  if (options.tree) {
    return formatTree(report);
  }
  return formatFull(report);
}

/** Serialize the full report as JSON. */
function formatJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

/** Render only the license distribution bar. */
function formatSummaryOnly(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold('License Distribution'));
  lines.push('═'.repeat(20));
  lines.push('');
  lines.push(formatDistribution(report));
  return lines.join('\n');
}

/** Render only conflicting/incompatible dependencies. */
function formatConflictsOnly(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold('License Conflicts'));
  lines.push('═'.repeat(17));
  lines.push('');
  if (report.conflicts.length === 0) {
    lines.push(chalk.green('No conflicts found.'));
  } else {
    lines.push(formatConflicts(report.conflicts));
  }
  return lines.join('\n');
}

/** Render full audit report: distribution + conflicts + warnings + summary line. */
function formatFull(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold('License Audit Report'));
  lines.push('═'.repeat(20));
  lines.push('');
  lines.push(chalk.bold('📊 Distribution:'));
  lines.push(formatDistribution(report));
  lines.push('');

  const conflictCount = report.conflicts.length;
  const warningCount = report.warnings.length;

  if (conflictCount > 0 || warningCount > 0) {
    lines.push(chalk.yellow.bold(`⚠️  Conflicts Found:`));
    lines.push(formatConflicts([...report.conflicts, ...report.warnings]));
    lines.push('');
  }

  lines.push(formatSummaryLine(report.totalDependencies, conflictCount));
  return lines.join('\n');
}

/**
 * Build a sorted inline distribution string.
 * E.g. "MIT: 142 (68%) | ISC: 34 (16%) | ..."
 */
function formatDistribution(report: AuditReport): string {
  const total = report.totalDependencies || 1;
  const sorted = Object.entries(report.distribution).sort(([, a], [, b]) => b - a);

  return sorted
    .map(([license, count]) => {
      const pct = Math.round((count / total) * 100);
      const label = `${license}: ${count} (${pct}%)`;
      if (license === 'Unknown' || license === 'UNKNOWN') {
        return chalk.yellow(label);
      }
      return chalk.cyan(label);
    })
    .join(chalk.gray(' | '));
}

/**
 * Render a tree-style block for a list of CompatibilityResults.
 * Uses box-drawing characters: ├──, │, └──
 */
function formatConflicts(results: CompatibilityResult[]): string {
  const lines: string[] = [];
  results.forEach((result, idx) => {
    const isLast = idx === results.length - 1;
    const prefix = isLast ? '└──' : '├──';
    const dep = result.dependency;
    const nameVer = chalk.bold(`${dep.name}@${dep.version}`);
    const licenseTag = chalk.red(`(${dep.license})`);
    const reason = dep.category === 'unknown'
      ? chalk.yellow('— No license field found')
      : chalk.red(`— INCOMPATIBLE with your ${result.reason}`);

    lines.push(`${prefix} ${nameVer} ${licenseTag} ${reason}`);

    if (dep.dependencyPath.length > 0) {
      const indent = isLast ? '    ' : '│   ';
      const pathStr = dep.dependencyPath.join(' → ');
      lines.push(`${indent}${chalk.gray('└── Required by:')} ${chalk.dim(pathStr)}`);
    }
  });
  return lines.join('\n');
}

/** Single-line summary: "196 dependencies checked. 2 conflicts found." */
function formatSummaryLine(total: number, conflictCount: number): string {
  const checked = chalk.green(`✅ ${total} dependencies checked.`);
  const conflicts =
    conflictCount === 0
      ? chalk.green('No conflicts found.')
      : chalk.red(`${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} found.`);
  return `${checked} ${conflicts}`;
}

/** Render a dependency tree with license annotations. */
function formatTree(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold('Dependency Tree'));
  lines.push('═'.repeat(15));
  lines.push('');

  const deps = report.allDependencies;
  deps.forEach((dep, idx) => {
    const isLast = idx === deps.length - 1;
    lines.push(...formatTreeNode(dep, isLast));
  });

  return lines.join('\n');
}

/** Format a single dependency tree node with its license tag. */
function formatTreeNode(dep: DependencyInfo, isLast: boolean): string[] {
  const prefix = isLast ? '└──' : '├──';
  const licenseColor = pickLicenseColor(dep.category);
  const licenseTag = licenseColor(`[${dep.license}]`);
  const nameVer = `${dep.name}@${dep.version}`;
  return [`${prefix} ${nameVer} ${licenseTag}`];
}

/** Pick a chalk color function based on license category. */
function pickLicenseColor(
  category: DependencyInfo['category'],
): (s: string) => string {
  switch (category) {
    case 'permissive':
      return chalk.green;
    case 'copyleft':
      return chalk.red;
    case 'unknown':
      return chalk.yellow;
    case 'custom':
      return chalk.magenta;
    default:
      return chalk.white;
  }
}
