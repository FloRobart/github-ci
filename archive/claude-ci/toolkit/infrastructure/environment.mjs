/**
 * Reads the parameters of a command. Workflows pass them as environment
 * variables, which keeps untrusted text (pull request titles, branch names)
 * out of shell command lines.
 */

import { WorkflowFailure } from './workflow-report.mjs';

/**
 * @param {string} variableName
 * @param {string} defaultValue
 * @returns {string} The trimmed value, or the default value when it is missing or blank.
 */
export function readOptionalVariable(variableName, defaultValue = '') {
  const value = process.env[variableName];

  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  return value.trim();
}

/**
 * @param {string} variableName
 * @returns {string} The trimmed value.
 */
export function readRequiredVariable(variableName) {
  const value = readOptionalVariable(variableName);

  if (value === '') {
    throw new WorkflowFailure('Configuration du pipeline incomplète', [
      `Le paramètre « ${variableName} » est vide ou absent.`,
      'Vérifiez les valeurs transmises au workflow réutilisable (bloc « with: ») dans le dépôt du projet.',
    ]);
  }

  return value;
}

/**
 * @param {string} variableName
 * @param {string[]} allowedValues
 * @returns {string} The value, guaranteed to be one of the allowed values.
 */
export function readChoiceVariable(variableName, allowedValues) {
  const value = readRequiredVariable(variableName);

  if (!allowedValues.includes(value)) {
    throw new WorkflowFailure('Configuration du pipeline invalide', [
      `Le paramètre « ${variableName} » vaut « ${value} ».`,
      `Valeurs acceptées : ${allowedValues.join(', ')}.`,
    ]);
  }

  return value;
}
