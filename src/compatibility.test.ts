import { describe, it, expect } from 'vitest';
import { checkSingleCompatibility, checkCompatibility } from './compatibility.js';
import type { DependencyInfo } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDep(
  name: string,
  license: string,
  category: DependencyInfo['category'] = 'permissive',
): DependencyInfo {
  return {
    name,
    version: '1.0.0',
    license,
    category,
    dependencyPath: [],
  };
}

const NO_LISTS = { allow: [], deny: [] };

// ---------------------------------------------------------------------------
// checkSingleCompatibility
// ---------------------------------------------------------------------------

describe('checkSingleCompatibility', () => {
  describe('permissive dep + permissive project', () => {
    it('MIT dep with MIT project is compatible', () => {
      const dep = makeDep('lodash', 'MIT', 'permissive');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
    });

    it('Apache-2.0 dep with MIT project is compatible', () => {
      const dep = makeDep('axios', 'Apache-2.0', 'permissive');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
    });

    it('ISC dep with MIT project is compatible', () => {
      const dep = makeDep('semver', 'ISC', 'permissive');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
    });
  });

  describe('strong copyleft dep + permissive project', () => {
    it('GPL-2.0 dep with MIT project is a conflict', () => {
      const dep = makeDep('some-gpl-pkg', 'GPL-2.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(false);
    });

    it('GPL-3.0 dep with MIT project is a conflict', () => {
      const dep = makeDep('another-gpl', 'GPL-3.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(false);
    });

    it('AGPL-3.0 dep with Apache-2.0 project is a conflict', () => {
      const dep = makeDep('agpl-pkg', 'AGPL-3.0', 'copyleft');
      const result = checkSingleCompatibility('Apache-2.0', dep, [], []);
      expect(result.compatible).toBe(false);
    });

    it('conflict reason references both dep license and project license', () => {
      const dep = makeDep('gpl-lib', 'GPL-3.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.reason).toContain('GPL-3.0');
      expect(result.reason).toContain('MIT');
    });
  });

  describe('LGPL dep + permissive project', () => {
    it('LGPL-2.1 dep with MIT project is compatible (with warning implied)', () => {
      const dep = makeDep('lgpl-lib', 'LGPL-2.1', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
    });

    it('LGPL-3.0 dep with MIT project is compatible', () => {
      const dep = makeDep('lgpl3-lib', 'LGPL-3.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
    });

    it('LGPL result reason mentions LGPL and review', () => {
      const dep = makeDep('lgpl-lib', 'LGPL-2.1', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.reason).toMatch(/lgpl/i);
    });
  });

  describe('MPL-2.0 (file-level copyleft) dep', () => {
    it('MPL-2.0 dep is compatible but warrants review', () => {
      const dep = makeDep('mpl-pkg', 'MPL-2.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
      expect(result.reason).toContain('MPL-2.0');
    });
  });

  describe('unknown dep license', () => {
    it('unknown license is compatible but flags manual review', () => {
      const dep = makeDep('mystery-pkg', 'SOME-WEIRD-LICENSE', 'unknown');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
      expect(result.reason).toMatch(/unknown|manual review/i);
    });
  });

  describe('custom dep license', () => {
    it('custom license is compatible but flags manual review', () => {
      const dep = makeDep('proprietary-pkg', 'SEE LICENSE IN LICENSE.md', 'custom');
      const result = checkSingleCompatibility('MIT', dep, [], []);
      expect(result.compatible).toBe(true);
      expect(result.reason).toMatch(/custom|manual review/i);
    });
  });

  describe('allow list overrides', () => {
    it('GPL-3.0 on allow list is compatible despite being strong copyleft', () => {
      const dep = makeDep('gpl-lib', 'GPL-3.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, ['GPL-3.0'], []);
      expect(result.compatible).toBe(true);
    });

    it('allow list result reason references the allow list', () => {
      const dep = makeDep('gpl-lib', 'GPL-3.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, ['GPL-3.0'], []);
      expect(result.reason).toMatch(/allow list/i);
    });

    it('GPL-2.0 on allow list overrides conflict', () => {
      const dep = makeDep('gpl2-lib', 'GPL-2.0', 'copyleft');
      const result = checkSingleCompatibility('MIT', dep, ['GPL-2.0'], []);
      expect(result.compatible).toBe(true);
    });
  });

  describe('deny list overrides', () => {
    it('MIT on deny list causes a conflict', () => {
      const dep = makeDep('lodash', 'MIT', 'permissive');
      const result = checkSingleCompatibility('MIT', dep, [], ['MIT']);
      expect(result.compatible).toBe(false);
    });

    it('deny list result reason references the deny list', () => {
      const dep = makeDep('lodash', 'MIT', 'permissive');
      const result = checkSingleCompatibility('MIT', dep, [], ['MIT']);
      expect(result.reason).toMatch(/deny list/i);
    });

    it('deny list takes precedence over allow list', () => {
      const dep = makeDep('lodash', 'MIT', 'permissive');
      // Both lists include MIT — deny wins.
      const result = checkSingleCompatibility('MIT', dep, ['MIT'], ['MIT']);
      expect(result.compatible).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// checkCompatibility (full AuditReport)
// ---------------------------------------------------------------------------

describe('checkCompatibility', () => {
  describe('AuditReport structure', () => {
    it('report contains all required top-level fields', () => {
      const deps = [makeDep('lodash', 'MIT', 'permissive')];
      const report = checkCompatibility('MIT', deps, NO_LISTS);

      expect(report).toHaveProperty('projectLicense');
      expect(report).toHaveProperty('totalDependencies');
      expect(report).toHaveProperty('distribution');
      expect(report).toHaveProperty('conflicts');
      expect(report).toHaveProperty('warnings');
      expect(report).toHaveProperty('allDependencies');
    });

    it('projectLicense matches the input', () => {
      const report = checkCompatibility('Apache-2.0', [], NO_LISTS);
      expect(report.projectLicense).toBe('Apache-2.0');
    });

    it('allDependencies is the same array that was passed in', () => {
      const deps = [makeDep('a', 'MIT', 'permissive'), makeDep('b', 'ISC', 'permissive')];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.allDependencies).toEqual(deps);
    });
  });

  describe('totalDependencies count', () => {
    it('is zero for an empty dependency list', () => {
      const report = checkCompatibility('MIT', [], NO_LISTS);
      expect(report.totalDependencies).toBe(0);
    });

    it('equals the number of deps passed in', () => {
      const deps = [
        makeDep('a', 'MIT', 'permissive'),
        makeDep('b', 'ISC', 'permissive'),
        makeDep('c', 'GPL-3.0', 'copyleft'),
      ];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.totalDependencies).toBe(3);
    });
  });

  describe('distribution counts', () => {
    it('counts each license correctly', () => {
      const deps = [
        makeDep('a', 'MIT', 'permissive'),
        makeDep('b', 'MIT', 'permissive'),
        makeDep('c', 'ISC', 'permissive'),
        makeDep('d', 'GPL-3.0', 'copyleft'),
      ];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.distribution['MIT']).toBe(2);
      expect(report.distribution['ISC']).toBe(1);
      expect(report.distribution['GPL-3.0']).toBe(1);
    });

    it('produces an empty distribution for no dependencies', () => {
      const report = checkCompatibility('MIT', [], NO_LISTS);
      expect(report.distribution).toEqual({});
    });

    it('sums all counts to totalDependencies', () => {
      const deps = [
        makeDep('a', 'MIT', 'permissive'),
        makeDep('b', 'ISC', 'permissive'),
        makeDep('c', 'Apache-2.0', 'permissive'),
      ];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      const total = Object.values(report.distribution).reduce((s, n) => s + n, 0);
      expect(total).toBe(report.totalDependencies);
    });
  });

  describe('conflicts array', () => {
    it('is empty when all deps are permissive', () => {
      const deps = [
        makeDep('a', 'MIT', 'permissive'),
        makeDep('b', 'ISC', 'permissive'),
      ];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.conflicts).toHaveLength(0);
    });

    it('contains GPL dep when project is MIT', () => {
      const gplDep = makeDep('evil-lib', 'GPL-3.0', 'copyleft');
      const deps = [makeDep('lodash', 'MIT', 'permissive'), gplDep];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0].dependency.name).toBe('evil-lib');
    });

    it('conflict result has compatible === false', () => {
      const deps = [makeDep('gpl-lib', 'GPL-2.0', 'copyleft')];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.conflicts[0].compatible).toBe(false);
    });
  });

  describe('warnings array', () => {
    it('contains LGPL dep as a warning (not a conflict)', () => {
      const deps = [makeDep('lgpl-lib', 'LGPL-2.1', 'copyleft')];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.warnings).toHaveLength(1);
      expect(report.conflicts).toHaveLength(0);
      expect(report.warnings[0].dependency.license).toBe('LGPL-2.1');
    });

    it('contains unknown-license dep as a warning', () => {
      const dep = makeDep('mystery', 'SOME-CUSTOM', 'unknown');
      const report = checkCompatibility('MIT', [dep], NO_LISTS);
      expect(report.warnings).toHaveLength(1);
      expect(report.conflicts).toHaveLength(0);
    });

    it('contains MPL-2.0 dep as a warning', () => {
      const dep = makeDep('mpl-lib', 'MPL-2.0', 'copyleft');
      const report = checkCompatibility('MIT', [dep], NO_LISTS);
      expect(report.warnings).toHaveLength(1);
      expect(report.conflicts).toHaveLength(0);
    });

    it('is empty when all deps are clean permissive licenses', () => {
      const deps = [
        makeDep('a', 'MIT', 'permissive'),
        makeDep('b', 'Apache-2.0', 'permissive'),
      ];
      const report = checkCompatibility('MIT', deps, NO_LISTS);
      expect(report.warnings).toHaveLength(0);
    });
  });

  describe('allow list in full report', () => {
    it('GPL dep on allow list does not appear in conflicts', () => {
      const deps = [makeDep('gpl-lib', 'GPL-3.0', 'copyleft')];
      const report = checkCompatibility('MIT', deps, { allow: ['GPL-3.0'], deny: [] });
      expect(report.conflicts).toHaveLength(0);
    });
  });

  describe('deny list in full report', () => {
    it('MIT dep on deny list appears in conflicts', () => {
      const deps = [makeDep('lodash', 'MIT', 'permissive')];
      const report = checkCompatibility('MIT', deps, { allow: [], deny: ['MIT'] });
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0].dependency.name).toBe('lodash');
    });
  });
});
