/**
 * Starts every command without any parameter.
 *
 * Each of them must stop on its first missing parameter with a readable
 * report. This proves that the command and all the modules it imports load
 * correctly, and that a configuration mistake never ends in a raw stack trace.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const EXIT_CODE_FAILURE = 1;

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const commandsDirectory = join(testsDirectory, '..', 'commands');
const commandFileNames = readdirSync(commandsDirectory).filter((fileName) => fileName.endsWith('.mjs'));

describe('a command started without any parameter', () => {
  for (const commandFileName of commandFileNames) {
    it(`${commandFileName} fails with a readable report`, () => {
      /* Only PATH is kept, so the variables set by a CI runner do not reach the command. */
      const result = spawnSync(process.execPath, [join(commandsDirectory, commandFileName)], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      });

      assert.equal(result.status, EXIT_CODE_FAILURE, result.stderr);
      assert.match(result.stdout, /^::error title=/m);
      assert.doesNotMatch(result.stdout, /Erreur inattendue/);
    });
  }
});
