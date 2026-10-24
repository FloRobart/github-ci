import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BumpLevel,
  compareSemanticVersions,
  findHighestBumpLevel,
  findHighestSemanticVersion,
  incrementSemanticVersion,
  isSemanticVersion,
} from '../core/semantic-version.mjs';

describe('isSemanticVersion', () => {
  it('accepts MAJOR.MINOR.PATCH', () => {
    assert.equal(isSemanticVersion('1.4.2'), true);
    assert.equal(isSemanticVersion('0.0.0'), true);
    assert.equal(isSemanticVersion('10.20.30'), true);
  });

  it('rejects anything else', () => {
    assert.equal(isSemanticVersion('1.4'), false);
    assert.equal(isSemanticVersion('v1.4.2'), false);
    assert.equal(isSemanticVersion('1.4.2-rc.1'), false);
    assert.equal(isSemanticVersion('1.04.2'), false);
    assert.equal(isSemanticVersion(''), false);
  });
});

describe('compareSemanticVersions', () => {
  it('compares numbers, not text', () => {
    assert.equal(compareSemanticVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareSemanticVersions('1.9.0', '1.10.0'), -1);
  });

  it('gives priority to the leftmost difference', () => {
    assert.equal(compareSemanticVersions('2.0.0', '1.99.99'), 1);
    assert.equal(compareSemanticVersions('1.2.3', '1.2.4'), -1);
  });

  it('returns 0 for equal versions', () => {
    assert.equal(compareSemanticVersions('3.0.17', '3.0.17'), 0);
  });

  it('refuses an invalid version', () => {
    assert.throws(() => compareSemanticVersions('1.0', '1.0.0'));
  });
});

describe('incrementSemanticVersion', () => {
  it('resets the lower numbers', () => {
    assert.equal(incrementSemanticVersion('1.4.2', BumpLevel.MAJOR), '2.0.0');
    assert.equal(incrementSemanticVersion('1.4.2', BumpLevel.MINOR), '1.5.0');
    assert.equal(incrementSemanticVersion('1.4.2', BumpLevel.PATCH), '1.4.3');
  });

  it('refuses an unknown bump level', () => {
    assert.throws(() => incrementSemanticVersion('1.4.2', 'huge'));
  });
});

describe('findHighestSemanticVersion', () => {
  it('returns the highest version whatever the order', () => {
    assert.equal(findHighestSemanticVersion(['1.2.0', '1.10.0', '1.9.9']), '1.10.0');
  });

  it('returns null for an empty list', () => {
    assert.equal(findHighestSemanticVersion([]), null);
  });
});

describe('findHighestBumpLevel', () => {
  it('returns the level with the biggest impact', () => {
    assert.equal(findHighestBumpLevel([BumpLevel.PATCH, BumpLevel.MAJOR, BumpLevel.MINOR]), BumpLevel.MAJOR);
    assert.equal(findHighestBumpLevel([BumpLevel.PATCH, BumpLevel.MINOR]), BumpLevel.MINOR);
  });

  it('falls back to a patch for an empty list', () => {
    assert.equal(findHighestBumpLevel([]), BumpLevel.PATCH);
  });
});
