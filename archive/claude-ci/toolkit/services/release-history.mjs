/**
 * What has already been published, and what changed since then.
 * Shared by the commands that start, preview and publish a version.
 */

import { buildChangelog, selectPullRequestsMergedInCommits } from '../core/changelog.mjs';
import { buildVersionTag, extractStableVersions } from '../core/flow-branches.mjs';
import { findHighestSemanticVersion } from '../core/semantic-version.mjs';
import { listCommitHashes } from '../infrastructure/git-repository.mjs';
import { buildCompareUrl, listMergedPullRequests } from '../infrastructure/github-client.mjs';

/**
 * @typedef {object} PublishedRelease
 * @property {string} version
 * @property {string} tagName
 * @property {string} commitHash
 */

/**
 * @param {{ name: string, commitHash: string }[]} remoteTags
 * @param {string | null} ignoredVersion Version to leave out, typically the one being published.
 * @returns {PublishedRelease | null} The highest published version, null when nothing was published yet.
 */
export function findLatestRelease(remoteTags, ignoredVersion = null) {
  const publishedVersions = extractStableVersions(remoteTags.map((tag) => tag.name))
    .filter((version) => version !== ignoredVersion);

  const latestVersion = findHighestSemanticVersion(publishedVersions);

  if (latestVersion === null) {
    return null;
  }

  const tagName = buildVersionTag(latestVersion);
  const tag = remoteTags.find((remoteTag) => remoteTag.name === tagName);

  return { version: latestVersion, tagName, commitHash: tag.commitHash };
}

/**
 * @param {PublishedRelease | null} previousRelease null to look at the whole history.
 * @param {string} revision Commit or branch whose content is being released.
 * @returns {import('../core/changelog.mjs').MergedPullRequest[]}
 *   Pull requests contained in the revision and not in the previous release.
 */
export function listPullRequestsMergedSince(previousRelease, revision) {
  const revisionRange = previousRelease === null ? revision : `${previousRelease.commitHash}..${revision}`;
  const unreleasedCommitHashes = listCommitHashes(revisionRange);

  return selectPullRequestsMergedInCommits(listMergedPullRequests(), unreleasedCommitHashes);
}

/**
 * @param {object} release
 * @param {string} release.introduction First paragraph of the notes.
 * @param {string} release.tagName Tag of the version the notes describe.
 * @param {PublishedRelease | null} release.previousRelease
 * @param {import('../core/changelog.mjs').MergedPullRequest[]} release.pullRequests
 * @returns {string} Markdown notes of a GitHub Release.
 */
export function buildReleaseNotes(release) {
  const paragraphs = [release.introduction, buildChangelog(release.pullRequests)];

  if (release.previousRelease !== null) {
    const compareUrl = buildCompareUrl(release.previousRelease.tagName, release.tagName);

    paragraphs.push(`**Comparaison complète** : ${compareUrl}`);
  }

  return paragraphs.join('\n\n');
}
