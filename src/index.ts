#!/usr/bin/env node

import { Command } from 'commander';
import { scanDependencies } from './scanner.js';
import { classifyLicense, normalizeLicense } from './classifier.js';
import { checkCompatibility } from './compatibility.js';
import { formatReport } from './formatter.js';
import type { CliOptions, DependencyInfo } from './types.js';

/** Parse a comma-separated string into a trimmed, non-empty string array. */
function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Enrich each dependency with its normalized license and classified category. */
function enrichDependencies(deps: DependencyInfo[]): DependencyInfo[] {
  return deps.map((dep) => {
    const license = normalizeLicense(dep.license);
    const category = classifyLicense(license);
    return { ...dep, license, category };
  });
}

/** Build CliOptions from parsed Commander values. */
function buildOptions(opts: Record<string, unknown>): CliOptions {
  return {
    summary: Boolean(opts['summary']),
    conflicts: Boolean(opts['conflicts']),
    allow: opts['allow'] ? parseList(opts['allow'] as string) : [],
    deny: opts['deny'] ? parseList(opts['deny'] as string) : [],
    ci: Boolean(opts['ci']),
    json: Boolean(opts['json']),
    tree: Boolean(opts['tree']),
    production: Boolean(opts['production']),
  };
}

/** Print a user-friendly error and exit with code 1. */
function fatal(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Core audit flow: scan → enrich → check → format → print. */
async function run(options: CliOptions): Promise<void> {
  const projectDir = process.cwd();

  let projectLicense: string;
  let rawDeps: DependencyInfo[];

  try {
    ({ projectLicense, dependencies: rawDeps } = await scanDependencies(
      projectDir,
      options.production,
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('No package.json')) {
      fatal('No package.json found. Run licensecheck inside a Node.js project directory.');
    }
    // node_modules absent: scanner returns empty deps, but surface the error clearly
    if (message.toLowerCase().includes('node_modules')) {
      fatal('node_modules not found. Run "npm install" (or your package manager) first.');
    }
    fatal(message);
  }

  const deps = enrichDependencies(rawDeps);
  const report = checkCompatibility(projectLicense, deps, options);
  const output = formatReport(report, options);

  console.log(output);

  if (options.ci && report.conflicts.length > 0) {
    process.exit(1);
  }
}

/** Entry point: define CLI and dispatch to run(). */
function main(): void {
  const program = new Command();

  program
    .name('licensecheck')
    .description('Scan all dependencies for license compatibility issues.')
    .version('0.1.0')
    .option('--summary', 'show only license distribution')
    .option('--conflicts', 'show only conflicts')
    .option('--allow <licenses>', 'comma-separated license whitelist (e.g. "MIT,Apache-2.0,ISC")')
    .option('--deny <licenses>', 'comma-separated license blacklist (e.g. "GPL,AGPL")')
    .option('--ci', 'exit with code 1 if conflicts are found')
    .option('--json', 'output results as JSON')
    .option('--tree', 'show dependency tree with license annotations')
    .option('--production', 'skip devDependencies')
    .action((opts: Record<string, unknown>) => {
      const options = buildOptions(opts);
      run(options).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        fatal(message);
      });
    });

  program.parse(process.argv);
}

main();
