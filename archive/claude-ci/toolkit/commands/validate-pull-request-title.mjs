/**
 * Checks that a pull request title follows the Conventional Commits format.
 *
 * Parameters (environment variables):
 *   PULL_REQUEST_TITLE  Title to check.
 *   ALLOWED_TYPES       Optional list of accepted types, separated by commas or spaces.
 */

import { DEFAULT_ALLOWED_TYPES, TitleProblem, parseConventionalTitle } from '../core/conventional-title.mjs';
import { determinePullRequestBumpLevel } from '../core/release-bump.mjs';
import { BumpLevel } from '../core/semantic-version.mjs';
import { readOptionalVariable, readRequiredVariable } from '../infrastructure/environment.mjs';
import { WorkflowFailure, reportSuccess, runWorkflowCommand } from '../infrastructure/workflow-report.mjs';

const TYPE_LIST_SEPARATOR_PATTERN = /[\s,]+/;

const VERSION_IMPACT_BY_BUMP_LEVEL = {
  [BumpLevel.MAJOR]: 'majeure (changement cassant)',
  [BumpLevel.MINOR]: 'mineure (nouvelle fonctionnalité)',
  [BumpLevel.PATCH]: 'correctif',
};

const PROBLEM_EXPLANATIONS = {
  [TitleProblem.MISSING_SEPARATOR]: () =>
    'il manque « : » entre le type et la description.',
  [TitleProblem.MALFORMED_HEADER]: () =>
    'la partie située avant « : » doit être un type seul, éventuellement suivi d\'un scope entre parenthèses puis de « ! » (exemples : « feat », « fix(auth) », « feat(api)! »).',
  [TitleProblem.UNKNOWN_TYPE]: (parsedTitle) =>
    `le type « ${parsedTitle.type} » n'est pas accepté. Les types s'écrivent en minuscules.`,
  [TitleProblem.EMPTY_SCOPE]: () =>
    'les parenthèses du scope sont vides. Indiquez un scope ou retirez les parenthèses.',
  [TitleProblem.EMPTY_DESCRIPTION]: () =>
    'il manque la description après « : ».',
  [TitleProblem.MISSING_SPACE_AFTER_SEPARATOR]: () =>
    'il manque une espace après « : ».',
};

/**
 * @returns {readonly string[]} Types accepted for this repository.
 */
function readAllowedTypes() {
  const configuredTypes = readOptionalVariable('ALLOWED_TYPES')
    .split(TYPE_LIST_SEPARATOR_PATTERN)
    .filter((type) => type !== '');

  return configuredTypes.length > 0 ? configuredTypes : DEFAULT_ALLOWED_TYPES;
}

/**
 * @param {string} title
 * @param {import('../core/conventional-title.mjs').ParsedTitle} parsedTitle
 * @param {readonly string[]} allowedTypes
 * @returns {WorkflowFailure}
 */
function buildInvalidTitleFailure(title, parsedTitle, allowedTypes) {
  const problemLines = parsedTitle.problems.map((problem) => `- ${PROBLEM_EXPLANATIONS[problem](parsedTitle)}`);

  return new WorkflowFailure('Titre de pull request invalide', [
    `Titre reçu : « ${title} »`,
    `Problème détecté :\n${problemLines.join('\n')}`,
    'Format attendu (Conventional Commits) : `type(scope optionnel): description`',
    `Types acceptés : ${allowedTypes.join(', ')}.`,
    'Exemples valides :\n- `feat(auth): ajouter la connexion par e-mail`\n- `fix: corriger le calcul du solde`\n- `feat(api)!: supprimer la route /v1/users`',
    'Pourquoi : la prochaine version est calculée à partir de ces titres (« feat » → mineure, « ! » → majeure, le reste → correctif). Modifiez le titre de la pull request : la vérification se relance toute seule.',
  ]);
}

function validatePullRequestTitle() {
  const title = readRequiredVariable('PULL_REQUEST_TITLE');
  const allowedTypes = readAllowedTypes();
  const parsedTitle = parseConventionalTitle(title, allowedTypes);

  if (!parsedTitle.isValid) {
    throw buildInvalidTitleFailure(title, parsedTitle, allowedTypes);
  }

  const versionImpact = VERSION_IMPACT_BY_BUMP_LEVEL[determinePullRequestBumpLevel({ title })];

  reportSuccess('Titre de pull request valide', [
    `« ${title} »`,
    `Type : ${parsedTitle.type}. Impact sur la prochaine version : ${versionImpact}.`,
  ]);
}

await runWorkflowCommand(validatePullRequestTitle);
