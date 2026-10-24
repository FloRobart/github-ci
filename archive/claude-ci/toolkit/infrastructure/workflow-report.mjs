/**
 * Everything a command tells GitHub Actions and the person reading the run:
 * annotations, job summary, step outputs and failures.
 */

import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const EXIT_CODE_FAILURE = 1;

/**
 * An expected failure: something the user can understand and fix.
 * Its title and explanation are shown as they are, without a stack trace.
 */
export class WorkflowFailure extends Error {
  /**
   * @param {string} title Short sentence saying what went wrong.
   * @param {string[]} explanationParagraphs Details, then what to do about it.
   */
  constructor(title, explanationParagraphs = []) {
    super(title);
    this.name = 'WorkflowFailure';
    this.title = title;
    this.explanationParagraphs = explanationParagraphs;
  }
}

/* ========================================================================== */
/* Section 1 : Writing to the runner                                          */
/* ========================================================================== */

/**
 * @param {string} text
 * @returns {string} Text safe to use as the message of a workflow command.
 */
function escapeAnnotationMessage(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/**
 * @param {string} text
 * @returns {string} Text safe to use as a property (title) of a workflow command.
 */
function escapeAnnotationProperty(text) {
  return escapeAnnotationMessage(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

/**
 * Appends text to a file whose path is given by the runner. Outside GitHub
 * Actions (local run, unit tests) the variable is not set and nothing is written.
 *
 * @param {string} environmentVariableName
 * @param {string} text
 */
function appendToRunnerFile(environmentVariableName, text) {
  const filePath = process.env[environmentVariableName];

  if (filePath === undefined || filePath === '') {
    return;
  }

  appendFileSync(filePath, text);
}

/**
 * @param {string} annotationLevel "error", "warning" or "notice".
 * @param {string} icon
 * @param {string} title
 * @param {string[]} paragraphs
 */
function publishReport(annotationLevel, icon, title, paragraphs) {
  const annotationTitle = escapeAnnotationProperty(`${icon} ${title}`);
  const annotationMessage = escapeAnnotationMessage(paragraphs.join('\n'));

  console.log(`::${annotationLevel} title=${annotationTitle}::${annotationMessage}`);
  appendToRunnerFile('GITHUB_STEP_SUMMARY', `### ${icon} ${title}\n\n${paragraphs.join('\n\n')}\n\n`);
}

/* ========================================================================== */
/* Section 2 : Reports                                                        */
/* ========================================================================== */

/**
 * @param {string} title
 * @param {string[]} paragraphs
 */
export function reportSuccess(title, paragraphs = []) {
  publishReport('notice', '✅', title, paragraphs);
}

/**
 * @param {string} title
 * @param {string[]} paragraphs
 */
export function reportInformation(title, paragraphs = []) {
  publishReport('notice', 'ℹ️', title, paragraphs);
}

/**
 * @param {string} title
 * @param {string[]} paragraphs
 */
export function reportWarning(title, paragraphs = []) {
  publishReport('warning', '⚠️', title, paragraphs);
}

/**
 * @param {string} title
 * @param {string[]} paragraphs
 */
function reportFailure(title, paragraphs = []) {
  publishReport('error', '❌', title, paragraphs);
}

/* ========================================================================== */
/* Section 3 : Step outputs                                                   */
/* ========================================================================== */

/**
 * @param {string} outputName
 * @param {string} value
 */
export function setOutput(outputName, value) {
  /* A random delimiter keeps values containing line breaks or "=" intact. */
  const delimiter = `output-delimiter-${randomUUID()}`;

  appendToRunnerFile('GITHUB_OUTPUT', `${outputName}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/* ========================================================================== */
/* Section 4 : Command entry point                                            */
/* ========================================================================== */

/**
 * @param {unknown} error
 */
function reportCaughtError(error) {
  if (error instanceof WorkflowFailure) {
    reportFailure(error.title, error.explanationParagraphs);
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  reportFailure('Erreur inattendue du pipeline', [
    errorMessage,
    "Cette erreur n'était pas prévue par le pipeline. Relancez le workflow ; si elle persiste, le détail technique se trouve dans le journal de cette étape.",
  ]);

  console.error(error);
}

/**
 * Runs a command and turns any error into a readable report and a failed step.
 *
 * @param {() => void | Promise<void>} command
 */
export async function runWorkflowCommand(command) {
  try {
    await command();
  } catch (error) {
    reportCaughtError(error);
    process.exitCode = EXIT_CODE_FAILURE;
  }
}
