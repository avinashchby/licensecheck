# licensecheck

Audit every npm dependency for license compatibility issues before they become a legal problem.

## Quick Start

```bash
npx @avinashchby/licensecheck
```

## What It Does

`licensecheck` walks your project's entire `node_modules` tree — direct and transitive dependencies — and checks each package's license against your own project license. It detects hard conflicts (e.g. a GPL dependency inside a permissive MIT project), flags warnings for LGPL and MPL packages that need manual review, and surfaces dependencies with no license information at all. Allow and deny lists let you encode your organisation's policy so the check stays repeatable in CI.

## Features

- Breadth-first walk of the full dependency graph, including transitive packages
- Handles both current (`"license"`) and legacy (`"licenses"` array) package.json formats
- Normalises non-SPDX aliases (`"Apache 2.0"`, `"BSD"`, `"public domain"`, etc.) to canonical SPDX identifiers
- Parses SPDX compound expressions with `OR` (most-permissive wins) and `AND` (most-restrictive wins)
- Three conflict severities: hard conflict, LGPL/MPL warning, unknown license warning
- Allow and deny lists override default compatibility rules
- `--production` flag to skip devDependencies
- `--json` output for downstream tooling integration

## Usage

Run with no flags for a full audit report:

```bash
npx @avinashchby/licensecheck
```

Skip devDependencies and exit with code 1 on any conflict (CI mode):

```bash
npx @avinashchby/licensecheck --production --ci
```

Show only the license distribution breakdown without individual package details:

```bash
npx @avinashchby/licensecheck --summary
```

Show only packages with conflicts, and block any GPL or AGPL licenses explicitly:

```bash
npx @avinashchby/licensecheck --conflicts --deny "GPL-2.0,GPL-3.0,AGPL-3.0"
```

Emit the full report as JSON and pipe it to another tool:

```bash
npx @avinashchby/licensecheck --json | jq '.conflicts'
```

Show the full dependency tree annotated with each package's license category:

```bash
npx @avinashchby/licensecheck --tree
```

## Example Output

Default full report:

```
License Audit Report
════════════════════

📊 Distribution:
MIT: 142 (68%) | ISC: 34 (16%) | Apache-2.0: 12 (6%) | BSD-3-Clause: 8 (4%) | ...

⚠️  Conflicts Found:
├── some-gpl-lib@2.1.0 (GPL-3.0) — INCOMPATIBLE with your project license "MIT"
│   └── Required by: webpack → some-loader
└── mystery-pkg@1.0.0 (UNKNOWN) — No license field found

✅ 196 dependencies checked. 2 conflicts found.
```

`--summary` mode:

```
License Distribution
════════════════════

MIT: 142 (68%) | ISC: 34 (16%) | Apache-2.0: 12 (6%) | ...
```

`--json` output contains `projectLicense`, `totalDependencies`, `distribution`, `conflicts`, `warnings`, and `allDependencies` arrays.

## Installation

```bash
npm install -g @avinashchby/licensecheck
# or
npx @avinashchby/licensecheck
```

Requires Node.js 18 or later.

## License

MIT
