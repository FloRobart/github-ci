import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildChangelog, selectPullRequestsMergedInCommits } from '../core/changelog.mjs';

/**
 * @param {number} number
 * @param {string} title
 * @param {string} headRefName
 * @param {string | null} mergeCommitHash
 */
function buildPullRequest(number, title, headRefName, mergeCommitHash) {
  const mergeCommit = mergeCommitHash === null ? null : { oid: mergeCommitHash };

  return { number, title, headRefName, mergeCommit };
}

describe('selectPullRequestsMergedInCommits', () => {
  const pullRequests = [
    buildPullRequest(12, 'feat: export', 'feature/export', 'hash-c'),
    buildPullRequest(10, 'fix: solde', 'fix/solde', 'hash-a'),
    buildPullRequest(11, 'chore(release): 1.3.0', 'release/1.3.0', 'hash-b'),
    buildPullRequest(13, 'chore(release): back-merge v1.3.0 vers develop', 'back-merge/v1.3.0', 'hash-d'),
    buildPullRequest(9, 'feat: déjà publié', 'feature/old', 'hash-old'),
    buildPullRequest(14, 'feat: sans commit de merge', 'feature/odd', null),
  ];

  it('keeps the pull requests of the commits, sorted, without the ones of the pipeline', () => {
    const selectedPullRequests = selectPullRequestsMergedInCommits(pullRequests, ['hash-a', 'hash-b', 'hash-c', 'hash-d']);

    assert.deepEqual(selectedPullRequests.map((pullRequest) => pullRequest.number), [10, 12]);
  });

  it('returns nothing when no commit matches', () => {
    assert.deepEqual(selectPullRequestsMergedInCommits(pullRequests, ['hash-unknown']), []);
  });
});

describe('buildChangelog', () => {
  it('groups the pull requests by kind of change, in a fixed order', () => {
    const changelog = buildChangelog([
      buildPullRequest(1, 'chore(deps): mettre à jour express', 'chore/deps', 'a'),
      buildPullRequest(2, 'fix: corriger le solde', 'fix/solde', 'b'),
      buildPullRequest(3, 'feat(auth): ajouter la connexion', 'feature/auth', 'c'),
      buildPullRequest(4, 'feat(api)!: supprimer la route /v1', 'feature/api', 'd'),
      buildPullRequest(5, 'perf: accélérer le tableau de bord', 'perf/dashboard', 'e'),
    ]);

    assert.equal(changelog, [
      '### 💥 Changements cassants\n\n- feat(api)!: supprimer la route /v1 (#4)',
      '### ✨ Nouveautés\n\n- feat(auth): ajouter la connexion (#3)',
      '### 🐛 Corrections\n\n- fix: corriger le solde (#2)',
      '### ⚡ Performances\n\n- perf: accélérer le tableau de bord (#5)',
      '### 🔧 Autres changements\n\n- chore(deps): mettre à jour express (#1)',
    ].join('\n\n'));
  });

  it('leaves out the sections without any pull request', () => {
    const changelog = buildChangelog([buildPullRequest(2, 'fix: corriger le solde', 'fix/solde', 'b')]);

    assert.equal(changelog, '### 🐛 Corrections\n\n- fix: corriger le solde (#2)');
  });

  it('says so when there is no pull request', () => {
    assert.match(buildChangelog([]), /Aucune pull request/);
  });
});
