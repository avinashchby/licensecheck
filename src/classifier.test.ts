import { describe, it, expect } from 'vitest';
import { classifyLicense, normalizeLicense } from './classifier.js';

describe('classifyLicense', () => {
  describe('permissive licenses', () => {
    it.each([
      'MIT',
      'Apache-2.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'ISC',
      '0BSD',
    ])('classifies %s as permissive', (license) => {
      expect(classifyLicense(license)).toBe('permissive');
    });
  });

  describe('copyleft licenses', () => {
    it.each([
      'GPL-2.0',
      'GPL-3.0',
      'AGPL-3.0',
      'LGPL-2.1',
      'LGPL-3.0',
      'MPL-2.0',
    ])('classifies %s as copyleft', (license) => {
      expect(classifyLicense(license)).toBe('copyleft');
    });
  });

  describe('unknown licenses', () => {
    it('classifies empty string as unknown', () => {
      expect(classifyLicense('')).toBe('unknown');
    });

    it('classifies null as unknown', () => {
      expect(classifyLicense(null)).toBe('unknown');
    });

    it('classifies undefined as unknown', () => {
      expect(classifyLicense(undefined)).toBe('unknown');
    });

    it('classifies "UNLICENSED" as unknown', () => {
      expect(classifyLicense('UNLICENSED')).toBe('unknown');
    });

    it('classifies "unlicensed" (lowercase) as unknown', () => {
      expect(classifyLicense('unlicensed')).toBe('unknown');
    });

    it('classifies "UNKNOWN" as unknown', () => {
      expect(classifyLicense('UNKNOWN')).toBe('unknown');
    });
  });

  describe('custom licenses', () => {
    it('classifies "SEE LICENSE IN LICENSE.md" as custom', () => {
      expect(classifyLicense('SEE LICENSE IN LICENSE.md')).toBe('custom');
    });

    it('classifies "SEE LICENSE IN LICENSE" as custom', () => {
      expect(classifyLicense('SEE LICENSE IN LICENSE')).toBe('custom');
    });

    it('classifies lowercase "see license in file" as custom', () => {
      expect(classifyLicense('see license in file')).toBe('custom');
    });
  });

  describe('OR expressions', () => {
    it('classifies "(MIT OR GPL-3.0)" as permissive — most permissive wins', () => {
      expect(classifyLicense('(MIT OR GPL-3.0)')).toBe('permissive');
    });

    it('classifies "(Apache-2.0 OR GPL-2.0)" as permissive', () => {
      expect(classifyLicense('(Apache-2.0 OR GPL-2.0)')).toBe('permissive');
    });

    it('classifies "(GPL-2.0 OR GPL-3.0)" as copyleft when both sides are copyleft', () => {
      expect(classifyLicense('(GPL-2.0 OR GPL-3.0)')).toBe('copyleft');
    });
  });

  describe('AND expressions', () => {
    it('classifies "(MIT AND GPL-3.0)" as copyleft — most restrictive wins', () => {
      expect(classifyLicense('(MIT AND GPL-3.0)')).toBe('copyleft');
    });

    it('classifies "(Apache-2.0 AND BSD-3-Clause)" as permissive when both sides are permissive', () => {
      expect(classifyLicense('(Apache-2.0 AND BSD-3-Clause)')).toBe('permissive');
    });

    it('classifies "(MIT AND AGPL-3.0)" as copyleft', () => {
      expect(classifyLicense('(MIT AND AGPL-3.0)')).toBe('copyleft');
    });
  });

  describe('case insensitivity', () => {
    it('classifies "mit" the same as "MIT"', () => {
      expect(classifyLicense('mit')).toBe(classifyLicense('MIT'));
    });

    it('classifies "apache-2.0" the same as "Apache-2.0"', () => {
      expect(classifyLicense('apache-2.0')).toBe(classifyLicense('Apache-2.0'));
    });

    it('classifies "gpl-3.0" the same as "GPL-3.0"', () => {
      expect(classifyLicense('gpl-3.0')).toBe(classifyLicense('GPL-3.0'));
    });

    it('classifies "isc" the same as "ISC"', () => {
      expect(classifyLicense('isc')).toBe(classifyLicense('ISC'));
    });
  });
});

describe('normalizeLicense', () => {
  it('returns "UNKNOWN" for null', () => {
    expect(normalizeLicense(null)).toBe('UNKNOWN');
  });

  it('returns "UNKNOWN" for undefined', () => {
    expect(normalizeLicense(undefined)).toBe('UNKNOWN');
  });

  it('returns "UNKNOWN" for empty string', () => {
    expect(normalizeLicense('')).toBe('UNKNOWN');
  });

  it('normalizes "apache 2.0" to "Apache-2.0"', () => {
    expect(normalizeLicense('apache 2.0')).toBe('Apache-2.0');
  });

  it('normalizes "apache2" to "Apache-2.0"', () => {
    expect(normalizeLicense('apache2')).toBe('Apache-2.0');
  });

  it('normalizes "apache 2" to "Apache-2.0"', () => {
    expect(normalizeLicense('apache 2')).toBe('Apache-2.0');
  });

  it('normalizes "bsd" to "BSD-3-Clause"', () => {
    expect(normalizeLicense('bsd')).toBe('BSD-3-Clause');
  });

  it('normalizes "bsd2" to "BSD-2-Clause"', () => {
    expect(normalizeLicense('bsd2')).toBe('BSD-2-Clause');
  });

  it('normalizes "bsd3" to "BSD-3-Clause"', () => {
    expect(normalizeLicense('bsd3')).toBe('BSD-3-Clause');
  });

  it('normalizes "gpl" to "GPL-3.0"', () => {
    expect(normalizeLicense('gpl')).toBe('GPL-3.0');
  });

  it('normalizes "gpl2" to "GPL-2.0"', () => {
    expect(normalizeLicense('gpl2')).toBe('GPL-2.0');
  });

  it('normalizes "gpl3" to "GPL-3.0"', () => {
    expect(normalizeLicense('gpl3')).toBe('GPL-3.0');
  });

  it('normalizes "lgpl" to "LGPL-2.1"', () => {
    expect(normalizeLicense('lgpl')).toBe('LGPL-2.1');
  });

  it('normalizes "mit/x11" to "MIT"', () => {
    expect(normalizeLicense('mit/x11')).toBe('MIT');
  });

  it('normalizes "public domain" to "Unlicense"', () => {
    expect(normalizeLicense('public domain')).toBe('Unlicense');
  });

  it('returns known SPDX identifiers unchanged', () => {
    expect(normalizeLicense('MIT')).toBe('MIT');
    expect(normalizeLicense('Apache-2.0')).toBe('Apache-2.0');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeLicense('  MIT  ')).toBe('MIT');
  });
});
