/**
 * Deduces the version bump of a release from the pull requests it contains.
 *
 * Rules:
 *   - breaking change ("!" in the title or a "BREAKING CHANGE:" footer in the body) -> major
 *   - "feat" type                                                                   -> minor
 *   - anything else                                                                 -> patch
 */

import { parseConventionalTitle } from './conventional-title.mjs';
import { BumpLevel, findHighestBumpLevel } from './semantic-version.mjs';

const FEATURE_TYPE = 'feat';
const BREAKING_CHANGE_FOOTER_PATTERN = /^BREAKING[ -]CHANGE:/m;

/**
 * @typedef {object} PullRequest
 * @property {number} number
 * @property {string} title
 * @property {string} [body]
 */

/**
 * @param {PullRequest} pullRequest
 * @returns {string} The BumpLevel required by this single pull request.
 */
export function determinePullRequestBumpLevel(pullRequest) {
  const parsedTitle = parseConventionalTitle(pullRequest.title);
  const hasBreakingChangeFooter = BREAKING_CHANGE_FOOTER_PATTERN.test(pullRequest.body ?? '');

  if (parsedTitle.isBreaking || hasBreakingChangeFooter) {
    return BumpLevel.MAJOR;
  }

  if (parsedTitle.type === FEATURE_TYPE) {
    return BumpLevel.MINOR;
  }

  return BumpLevel.PATCH;
}

/**
 * @param {PullRequest[]} pullRequests
 * @returns {{ bumpLevel: string, decisivePullRequests: PullRequest[] }}
 *   The highest bump level found, with the pull requests that require it.
 */
export function determineReleaseBump(pullRequests) {
  const bumpLevels = pullRequests.map(determinePullRequestBumpLevel);
  const bumpLevel = findHighestBumpLevel(bumpLevels);
  const decisivePullRequests = pullRequests.filter((_pullRequest, index) => bumpLevels[index] === bumpLevel);

  return { bumpLevel, decisivePullRequests };
}
