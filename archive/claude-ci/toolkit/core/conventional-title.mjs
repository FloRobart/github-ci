/**
 * Conventional Commits parsing for pull request titles.
 *
 * Expected format: <type>(<optional scope>)<optional !>: <description>
 * Specification: https://www.conventionalcommits.org/
 */

export const DEFAULT_ALLOWED_TYPES = Object.freeze([
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
]);

export const TitleProblem = Object.freeze({
  MISSING_SEPARATOR: 'missing-separator',
  MALFORMED_HEADER: 'malformed-header',
  UNKNOWN_TYPE: 'unknown-type',
  EMPTY_SCOPE: 'empty-scope',
  EMPTY_DESCRIPTION: 'empty-description',
  MISSING_SPACE_AFTER_SEPARATOR: 'missing-space-after-separator',
});

const SEPARATOR = ':';

/* The header is everything before the separator, for example "feat(auth)!". */
const HEADER_PATTERN = /^(?<type>[A-Za-z]+)(?<scopeGroup>\((?<scope>[^()]*)\))?(?<breakingMarker>!)?$/;

/**
 * @typedef {object} ParsedTitle
 * @property {boolean} isValid
 * @property {string | null} type
 * @property {string | null} scope
 * @property {boolean} isBreaking
 * @property {string | null} description
 * @property {string[]} problems TitleProblem values, empty when the title is valid.
 */

/**
 * @param {string} problem
 * @returns {ParsedTitle} The result used when the title cannot be split into its parts.
 */
function buildUnreadableTitle(problem) {
  return {
    isValid: false,
    type: null,
    scope: null,
    isBreaking: false,
    description: null,
    problems: [problem],
  };
}

/**
 * @param {string} title
 * @param {readonly string[]} allowedTypes
 * @returns {ParsedTitle}
 */
export function parseConventionalTitle(title, allowedTypes = DEFAULT_ALLOWED_TYPES) {
  const separatorIndex = title.indexOf(SEPARATOR);

  if (separatorIndex === -1) {
    return buildUnreadableTitle(TitleProblem.MISSING_SEPARATOR);
  }

  const headerMatch = HEADER_PATTERN.exec(title.slice(0, separatorIndex));

  if (headerMatch === null) {
    return buildUnreadableTitle(TitleProblem.MALFORMED_HEADER);
  }

  const { type, scopeGroup, scope, breakingMarker } = headerMatch.groups;
  const textAfterSeparator = title.slice(separatorIndex + SEPARATOR.length);
  const description = textAfterSeparator.trim();
  const problems = [];

  if (!allowedTypes.includes(type)) {
    problems.push(TitleProblem.UNKNOWN_TYPE);
  }

  if (scopeGroup !== undefined && scope.trim() === '') {
    problems.push(TitleProblem.EMPTY_SCOPE);
  }

  if (description === '') {
    problems.push(TitleProblem.EMPTY_DESCRIPTION);
  }

  if (description !== '' && !textAfterSeparator.startsWith(' ')) {
    problems.push(TitleProblem.MISSING_SPACE_AFTER_SEPARATOR);
  }

  return {
    isValid: problems.length === 0,
    type,
    scope: scope ?? null,
    isBreaking: breakingMarker !== undefined,
    description,
    problems,
  };
}
