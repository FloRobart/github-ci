/**
 * Decides which version a new release gets.
 */

import { determineReleaseBump } from './release-bump.mjs';
import { compareSemanticVersions, incrementSemanticVersion } from './semantic-version.mjs';

/* Value of the "bump" input that lets the pull request titles decide. */
export const AUTOMATIC_BUMP = 'auto';

/* Explains where the planned version comes from, so the report can tell the user. */
export const VersionOrigin = Object.freeze({
  INITIAL_RELEASE: 'initial-release',
  PULL_REQUEST_TITLES: 'pull-request-titles',
  REQUESTED_BUMP: 'requested-bump',
  PROJECT_VERSION_AHEAD: 'project-version-ahead',
});

/**
 * @typedef {object} ReleaseVersionPlan
 * @property {string} version The version the release will get.
 * @property {string | null} bumpLevel The applied BumpLevel, null when the project version is kept as is.
 * @property {string} origin One of the VersionOrigin values.
 * @property {import('./release-bump.mjs').PullRequest[]} decisivePullRequests
 *   Pull requests that justify the bump, only filled when the titles decided.
 */

/**
 * @param {object} situation
 * @param {string | null} situation.latestReleasedVersion Highest published version, null before the first release.
 * @param {string} situation.currentProjectVersion Version written in the project files.
 * @param {string} situation.requestedBump AUTOMATIC_BUMP or a BumpLevel value.
 * @param {import('./release-bump.mjs').PullRequest[]} situation.unreleasedPullRequests
 * @returns {ReleaseVersionPlan}
 */
export function planReleaseVersion(situation) {
  const { latestReleasedVersion, currentProjectVersion, requestedBump, unreleasedPullRequests } = situation;
  const isBumpRequested = requestedBump !== AUTOMATIC_BUMP;

  /* First release of the project: the version already written in the files is the one to publish. */
  if (latestReleasedVersion === null && !isBumpRequested) {
    return {
      version: currentProjectVersion,
      bumpLevel: null,
      origin: VersionOrigin.INITIAL_RELEASE,
      decisivePullRequests: [],
    };
  }

  const deducedBump = determineReleaseBump(unreleasedPullRequests);
  const bumpLevel = isBumpRequested ? requestedBump : deducedBump.bumpLevel;
  const computedVersion = incrementSemanticVersion(latestReleasedVersion ?? currentProjectVersion, bumpLevel);

  /* A version raised by hand in the project files is never lowered. */
  if (compareSemanticVersions(currentProjectVersion, computedVersion) > 0) {
    return {
      version: currentProjectVersion,
      bumpLevel: null,
      origin: VersionOrigin.PROJECT_VERSION_AHEAD,
      decisivePullRequests: [],
    };
  }

  if (isBumpRequested) {
    return {
      version: computedVersion,
      bumpLevel,
      origin: VersionOrigin.REQUESTED_BUMP,
      decisivePullRequests: [],
    };
  }

  return {
    version: computedVersion,
    bumpLevel,
    origin: VersionOrigin.PULL_REQUEST_TITLES,
    decisivePullRequests: deducedBump.decisivePullRequests,
  };
}
