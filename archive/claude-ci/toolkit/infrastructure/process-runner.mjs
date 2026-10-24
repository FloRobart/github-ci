/**
 * Runs external programs (git, gh, npm) without going through a shell, so
 * arguments never need quoting and cannot be interpreted as commands.
 */

import { execFileSync } from 'node:child_process';

const MAXIMUM_OUTPUT_BYTES = 64 * 1024 * 1024;

export class CommandExecutionError extends Error {
  /**
   * @param {string} commandLine
   * @param {number | null} exitCode
   * @param {string} errorOutput
   */
  constructor(commandLine, exitCode, errorOutput) {
    super(`La commande « ${commandLine} » a échoué (code de sortie : ${exitCode}).\n${errorOutput}`);
    this.name = 'CommandExecutionError';
    this.exitCode = exitCode;
    this.errorOutput = errorOutput;
  }
}

/**
 * @typedef {object} CommandResult
 * @property {boolean} succeeded
 * @property {number | null} exitCode null when the program could not be started.
 * @property {string} output Trimmed standard output.
 * @property {string} errorOutput Trimmed error output.
 */

/**
 * Runs a program and reports a failure in the result instead of throwing.
 *
 * @param {string} executable
 * @param {string[]} commandArguments
 * @param {{ standardInput?: string }} options
 * @returns {CommandResult}
 */
export function tryRunCommand(executable, commandArguments, options = {}) {
  try {
    const output = execFileSync(executable, commandArguments, {
      encoding: 'utf8',
      input: options.standardInput,
      maxBuffer: MAXIMUM_OUTPUT_BYTES,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { succeeded: true, exitCode: 0, output: output.trim(), errorOutput: '' };
  } catch (error) {
    return {
      succeeded: false,
      exitCode: error.status ?? null,
      output: String(error.stdout ?? '').trim(),
      errorOutput: String(error.stderr || error.message).trim(),
    };
  }
}

/**
 * Runs a program and throws when it fails.
 *
 * @param {string} executable
 * @param {string[]} commandArguments
 * @param {{ standardInput?: string }} options
 * @returns {string} Trimmed standard output.
 */
export function runCommand(executable, commandArguments, options = {}) {
  const result = tryRunCommand(executable, commandArguments, options);

  if (!result.succeeded) {
    const commandLine = [executable, ...commandArguments].join(' ');

    throw new CommandExecutionError(commandLine, result.exitCode, result.errorOutput);
  }

  return result.output;
}

/**
 * @param {string} text
 * @returns {string[]} Non-empty lines of the text.
 */
export function splitLines(text) {
  return text.split('\n').filter((line) => line.trim() !== '');
}
