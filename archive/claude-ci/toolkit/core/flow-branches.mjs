/**
 * Naming rules of the Git workflow: branches and tags.
 *
 *   release/1.4.0      release being prepared, created from the integration branch
 *   hotfix/1.3.1       urgent production fix, created from the production branch
 *   back-merge/v1.4.0  carries a published version back into the integration branch
 *   v1.4.0             published version
 *   v1.4.0-rc.2        release candidate of a version being prepared
 */

import { isSemanticVersion } from './semantic-version.mjs';

export const FlowKind = Object.freeze({
  RELEASE: 'release',
  HOTFIX: 'hotfix',
});

const FLOW_BRANCH_PATTERN = /^(?<kind>release|hotfix)\/(?<version>[^/]+)$/;
const BACK_MERGE_BRANCH_PREFIX = 'back-merge/';
const VERSION_TAG_PREFIX = 'v';
const RELEASE_CANDIDATE_SEPARATOR = '-rc.';

/**
 * @param {string} branchName
 * @returns {{ kind: string, version: string } | null} null when the branch is not a release or hotfix branch.
 */
export function parseFlowBranch(branchName) {
  const match = FLOW_BRANCH_PATTERN.exec(branchName);

  if (match === null || !isSemanticVersion(match.groups.version)) {
    return null;
  }

  return { kind: match.groups.kind, version: match.groups.version };
}

/**
 * @param {string} kind One of the FlowKind values.
 * @param {string} version
 * @returns {string}
 */
export function buildFlowBranchName(kind, version) {
  return `${kind}/${version}`;
}

/**
 * @param {string} version
 * @returns {string}
 */
export function buildBackMergeBranchName(version) {
  return `${BACK_MERGE_BRANCH_PREFIX}${buildVersionTag(version)}`;
}

/**
 * @param {string} branchName
 * @returns {boolean} true for branches created by the pipeline itself.
 */
export function isAutomationBranch(branchName) {
  return parseFlowBranch(branchName) !== null || branchName.startsWith(BACK_MERGE_BRANCH_PREFIX);
}

/**
 * @param {string} version
 * @returns {string}
 */
export function buildVersionTag(version) {
  return `${VERSION_TAG_PREFIX}${version}`;
}

/**
 * @param {string} version
 * @param {number} candidateNumber
 * @returns {string}
 */
export function buildReleaseCandidateTag(version, candidateNumber) {
  return `${buildVersionTag(version)}${RELEASE_CANDIDATE_SEPARATOR}${candidateNumber}`;
}

/**
 * @param {string} tagName
 * @param {string} version
 * @returns {boolean} true when the tag is a release candidate of the given version.
 */
export function isReleaseCandidateTagOf(tagName, version) {
  return tagName.startsWith(`${buildVersionTag(version)}${RELEASE_CANDIDATE_SEPARATOR}`);
}

/**
 * @param {string} tagName A version tag such as "v1.4.0" or "v1.4.0-rc.2".
 * @returns {string} The same name without the "v" prefix.
 */
export function removeVersionTagPrefix(tagName) {
  return tagName.slice(VERSION_TAG_PREFIX.length);
}

/**
 * @param {string[]} tagNames
 * @returns {string[]} Versions of the stable tags only (release candidates are ignored).
 */
export function extractStableVersions(tagNames) {
  return tagNames
    .filter((tagName) => tagName.startsWith(VERSION_TAG_PREFIX))
    .map(removeVersionTagPrefix)
    .filter(isSemanticVersion);
}

/**
 * @param {string[]} tagNames
 * @param {string} version
 * @returns {number} 1 for the first candidate of a version, then the highest existing number plus one.
 */
export function findNextReleaseCandidateNumber(tagNames, version) {
  const candidatePrefix = `${buildVersionTag(version)}${RELEASE_CANDIDATE_SEPARATOR}`;

  const existingNumbers = tagNames
    .filter((tagName) => tagName.startsWith(candidatePrefix))
    .map((tagName) => Number(tagName.slice(candidatePrefix.length)))
    .filter(Number.isInteger);

  return Math.max(0, ...existingNumbers) + 1;
}
