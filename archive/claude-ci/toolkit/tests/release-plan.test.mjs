import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { determinePullRequestBumpLevel, determineReleaseBump } from '../core/release-bump.mjs';
import { AUTOMATIC_BUMP, VersionOrigin, planReleaseVersion } from '../core/release-plan.mjs';
import { BumpLevel } from '../core/semantic-version.mjs';

const FIX_PULL_REQUEST = { number: 1, title: 'fix: corriger le solde' };
const FEATURE_PULL_REQUEST = { number: 2, title: 'feat(auth): ajouter la connexion' };
const BREAKING_PULL_REQUEST = { number: 3, title: 'feat(api)!: supprimer la route /v1' };
const CHORE_PULL_REQUEST = { number: 4, title: 'chore(deps): mettre à jour express' };

describe('determinePullRequestBumpLevel', () => {
  it('maps the title to a bump level', () => {
    assert.equal(determinePullRequestBumpLevel(FIX_PULL_REQUEST), BumpLevel.PATCH);
    assert.equal(determinePullRequestBumpLevel(CHORE_PULL_REQUEST), BumpLevel.PATCH);
    assert.equal(determinePullRequestBumpLevel(FEATURE_PULL_REQUEST), BumpLevel.MINOR);
    assert.equal(determinePullRequestBumpLevel(BREAKING_PULL_REQUEST), BumpLevel.MAJOR);
  });

  it('reads a breaking change footer in the body', () => {
    const pullRequest = { number: 5, title: 'fix: changer le format', body: 'Détails.\n\nBREAKING CHANGE: le champ date change.' };

    assert.equal(determinePullRequestBumpLevel(pullRequest), BumpLevel.MAJOR);
  });

  it('treats a title that is not conventional as a patch', () => {
    assert.equal(determinePullRequestBumpLevel({ number: 6, title: 'Ancienne pull request' }), BumpLevel.PATCH);
  });
});

describe('determineReleaseBump', () => {
  it('keeps the highest level and the pull requests that require it', () => {
    const releaseBump = determineReleaseBump([FIX_PULL_REQUEST, FEATURE_PULL_REQUEST, CHORE_PULL_REQUEST]);

    assert.equal(releaseBump.bumpLevel, BumpLevel.MINOR);
    assert.deepEqual(releaseBump.decisivePullRequests, [FEATURE_PULL_REQUEST]);
  });

  it('gives a patch when there is no pull request', () => {
    const releaseBump = determineReleaseBump([]);

    assert.equal(releaseBump.bumpLevel, BumpLevel.PATCH);
    assert.deepEqual(releaseBump.decisivePullRequests, []);
  });
});

describe('planReleaseVersion', () => {
  it('deduces the version from the pull request titles', () => {
    const plan = planReleaseVersion({
      latestReleasedVersion: '1.2.0',
      currentProjectVersion: '1.2.0',
      requestedBump: AUTOMATIC_BUMP,
      unreleasedPullRequests: [FIX_PULL_REQUEST, FEATURE_PULL_REQUEST],
    });

    assert.equal(plan.version, '1.3.0');
    assert.equal(plan.bumpLevel, BumpLevel.MINOR);
    assert.equal(plan.origin, VersionOrigin.PULL_REQUEST_TITLES);
    assert.deepEqual(plan.decisivePullRequests, [FEATURE_PULL_REQUEST]);
  });

  it('gives a major version for a breaking change', () => {
    const plan = planReleaseVersion({
      latestReleasedVersion: '1.2.3',
      currentProjectVersion: '1.2.3',
      requestedBump: AUTOMATIC_BUMP,
      unreleasedPullRequests: [FEATURE_PULL_REQUEST, BREAKING_PULL_REQUEST],
    });

    assert.equal(plan.version, '2.0.0');
  });

  it('applies the requested bump instead of the deduced one', () => {
    const plan = planReleaseVersion({
      latestReleasedVersion: '1.2.0',
      currentProjectVersion: '1.2.0',
      requestedBump: BumpLevel.MAJOR,
      unreleasedPullRequests: [FIX_PULL_REQUEST],
    });

    assert.equal(plan.version, '2.0.0');
    assert.equal(plan.origin, VersionOrigin.REQUESTED_BUMP);
  });

  it('keeps the project version for the first release', () => {
    const plan = planReleaseVersion({
      latestReleasedVersion: null,
      currentProjectVersion: '1.0.0',
      requestedBump: AUTOMATIC_BUMP,
      unreleasedPullRequests: [FEATURE_PULL_REQUEST],
    });

    assert.equal(plan.version, '1.0.0');
    assert.equal(plan.bumpLevel, null);
    assert.equal(plan.origin, VersionOrigin.INITIAL_RELEASE);
  });

  it('bumps the project version for a first release with a requested bump', () => {
    const plan = planReleaseVersion({
      latestReleasedVersion: null,
      currentProjectVersion: '0.1.0',
      requestedBump: BumpLevel.MAJOR,
      unreleasedPullRequests: [],
    });

    assert.equal(plan.version, '1.0.0');
    assert.equal(plan.origin, VersionOrigin.REQUESTED_BUMP);
  });

  it('never lowers a version raised by hand in the project files', () => {
    const plan = planReleaseVersion({
      latestReleasedVersion: '3.0.17',
      currentProjectVersion: '3.1.0',
      requestedBump: AUTOMATIC_BUMP,
      unreleasedPullRequests: [FIX_PULL_REQUEST],
    });

    assert.equal(plan.version, '3.1.0');
    assert.equal(plan.origin, VersionOrigin.PROJECT_VERSION_AHEAD);
  });
});
