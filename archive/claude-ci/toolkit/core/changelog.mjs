/**
 * Builds the list of changes of a version from its pull requests.
 *
 * The same text is used in the release pull request and in the GitHub Release,
 * so what is reviewed is exactly what gets published.
 */

import { parseConventionalTitle } from './conventional-title.mjs';
import { isAutomationBranch } from './flow-branches.mjs';
import { BumpLevel } from './semantic-version.mjs';
import { determinePullRequestBumpLevel } from './release-bump.mjs';

const EMPTY_CHANGELOG = '_Aucune pull request référencée pour cette version._';

/* Sections are tried in order: a pull request goes into the first one that accepts it. */
const CHANGELOG_SECTIONS = [
  { title: '💥 Changements cassants', accepts: (entry) => entry.isBreaking },
  { title: '✨ Nouveautés', accepts: (entry) => entry.type === 'feat' },
  { title: '🐛 Corrections', accepts: (entry) => entry.type === 'fix' },
  { title: '⚡ Performances', accepts: (entry) => entry.type === 'perf' },
  { title: '🔧 Autres changements', accepts: () => true },
];

/**
 * @typedef {object} MergedPullRequest
 * @property {number} number
 * @property {string} title
 * @property {string} [body]
 * @property {string} headRefName
 * @property {{ oid: string } | null} mergeCommit
 */

/**
 * @param {MergedPullRequest[]} pullRequests
 * @param {string[]} commitHashes
 * @returns {MergedPullRequest[]} Pull requests merged by one of the commits, without the ones
 *   opened by the pipeline (release, hotfix and back-merge), sorted by number.
 */
export function selectPullRequestsMergedInCommits(pullRequests, commitHashes) {
  const commitHashSet = new Set(commitHashes);

  return pullRequests
    .filter((pullRequest) => pullRequest.mergeCommit !== null && pullRequest.mergeCommit !== undefined)
    .filter((pullRequest) => commitHashSet.has(pullRequest.mergeCommit.oid))
    .filter((pullRequest) => !isAutomationBranch(pullRequest.headRefName))
    .sort((firstPullRequest, secondPullRequest) => firstPullRequest.number - secondPullRequest.number);
}

/**
 * @param {MergedPullRequest} pullRequest
 * @returns {{ line: string, type: string | null, isBreaking: boolean }}
 */
function buildChangelogEntry(pullRequest) {
  return {
    line: `- ${pullRequest.title} (#${pullRequest.number})`,
    type: parseConventionalTitle(pullRequest.title).type,
    isBreaking: determinePullRequestBumpLevel(pullRequest) === BumpLevel.MAJOR,
  };
}

/**
 * @param {object} entry
 * @returns {number} Index of the first section that accepts the entry.
 */
function findSectionIndex(entry) {
  return CHANGELOG_SECTIONS.findIndex((section) => section.accepts(entry));
}

/**
 * @param {MergedPullRequest[]} pullRequests
 * @returns {string} Markdown text grouped by kind of change.
 */
export function buildChangelog(pullRequests) {
  if (pullRequests.length === 0) {
    return EMPTY_CHANGELOG;
  }

  const entries = pullRequests.map(buildChangelogEntry);

  return CHANGELOG_SECTIONS
    .map((section, sectionIndex) => {
      const sectionLines = entries
        .filter((entry) => findSectionIndex(entry) === sectionIndex)
        .map((entry) => entry.line);

      return { title: section.title, lines: sectionLines };
    })
    .filter((section) => section.lines.length > 0)
    .map((section) => `### ${section.title}\n\n${section.lines.join('\n')}`)
    .join('\n\n');
}
