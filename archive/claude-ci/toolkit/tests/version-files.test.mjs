import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeNextBuildNumber,
  formatPubspecVersion,
  readJsonVersion,
  readPubspecVersion,
  replaceJsonVersion,
  replacePubspecVersion,
} from '../core/version-files.mjs';

const MANIFEST_CONTENT = `{
  "manifest_version": 3,
  "name": "Econoris",
  "version": "1.0.0",
  "browser_specific_settings": {
    "gecko": {
      "strict_min_version": "140.0"
    }
  }
}
`;

const PUBSPEC_CONTENT = `name: econoris_app
description: "Gestionnaire de finances Econoris."
publish_to: 'none'

# A version number is three numbers separated by dots, like 1.2.43
version: 3.0.17+20

environment:
  sdk: 3.13.4
`;

describe('JSON version files', () => {
  it('reads the version', () => {
    assert.equal(readJsonVersion(MANIFEST_CONTENT), '1.0.0');
  });

  it('returns null when there is no version', () => {
    assert.equal(readJsonVersion('{ "name": "demo" }'), null);
  });

  it('replaces only the version and keeps the formatting', () => {
    const updatedContent = replaceJsonVersion(MANIFEST_CONTENT, '1.1.0');

    assert.equal(updatedContent, MANIFEST_CONTENT.replace('"version": "1.0.0"', '"version": "1.1.0"'));
    assert.equal(JSON.parse(updatedContent).manifest_version, 3);
    assert.equal(JSON.parse(updatedContent).browser_specific_settings.gecko.strict_min_version, '140.0');
  });
});

describe('pubspec.yaml', () => {
  it('reads the version and the build number', () => {
    assert.deepEqual(readPubspecVersion(PUBSPEC_CONTENT), { version: '3.0.17', buildNumber: 20 });
  });

  it('reads a version without build number', () => {
    assert.deepEqual(readPubspecVersion('name: demo\nversion: 1.0.0\n'), { version: '1.0.0', buildNumber: null });
  });

  it('returns null when there is no version line', () => {
    assert.equal(readPubspecVersion('name: demo\n'), null);
  });

  it('ignores the word version inside comments and other keys', () => {
    const fileContent = '# version: 9.9.9\nname: demo\nversion: 1.2.3+4\n';

    assert.deepEqual(readPubspecVersion(fileContent), { version: '1.2.3', buildNumber: 4 });
  });

  it('replaces only the version line', () => {
    const updatedContent = replacePubspecVersion(PUBSPEC_CONTENT, { version: '3.1.0', buildNumber: 21 });

    assert.equal(updatedContent, PUBSPEC_CONTENT.replace('version: 3.0.17+20', 'version: 3.1.0+21'));
  });

  it('formats the version with or without build number', () => {
    assert.equal(formatPubspecVersion({ version: '3.1.0', buildNumber: 21 }), '3.1.0+21');
    assert.equal(formatPubspecVersion({ version: '3.1.0', buildNumber: null }), '3.1.0');
  });
});

describe('computeNextBuildNumber', () => {
  it('adds one to the build number in production', () => {
    assert.equal(computeNextBuildNumber(20), 21);
  });

  it('stays null for projects without build number', () => {
    assert.equal(computeNextBuildNumber(null), null);
  });
});
