import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyViolation, evaluateBranchPolicy } from '../core/branch-policy.mjs';
import {
  FlowKind,
  buildBackMergeBranchName,
  buildFlowBranchName,
  buildReleaseCandidateTag,
  buildVersionTag,
  extractStableVersions,
  findNextReleaseCandidateNumber,
  isAutomationBranch,
  isReleaseCandidateTagOf,
  parseFlowBranch,
  removeVersionTagPrefix,
} from '../core/flow-branches.mjs';

describe('parseFlowBranch', () => {
  it('reads release and hotfix branches', () => {
    assert.deepEqual(parseFlowBranch('release/1.4.0'), { kind: FlowKind.RELEASE, version: '1.4.0' });
    assert.deepEqual(parseFlowBranch('hotfix/1.4.1'), { kind: FlowKind.HOTFIX, version: '1.4.1' });
  });

  it('returns null for every other branch', () => {
    assert.equal(parseFlowBranch('feature/login'), null);
    assert.equal(parseFlowBranch('develop'), null);
    assert.equal(parseFlowBranch('release/next'), null);
    assert.equal(parseFlowBranch('release/1.4'), null);
    assert.equal(parseFlowBranch('release/1.4.0/extra'), null);
    assert.equal(parseFlowBranch('my-release/1.4.0'), null);
  });
});

describe('branch and tag names', () => {
  it('builds the names used by the pipeline', () => {
    assert.equal(buildFlowBranchName(FlowKind.RELEASE, '1.4.0'), 'release/1.4.0');
    assert.equal(buildBackMergeBranchName('1.4.0'), 'back-merge/v1.4.0');
    assert.equal(buildVersionTag('1.4.0'), 'v1.4.0');
    assert.equal(buildReleaseCandidateTag('1.4.0', 2), 'v1.4.0-rc.2');
    assert.equal(removeVersionTagPrefix('v1.4.0-rc.2'), '1.4.0-rc.2');
  });

  it('recognizes the branches created by the pipeline', () => {
    assert.equal(isAutomationBranch('release/1.4.0'), true);
    assert.equal(isAutomationBranch('hotfix/1.4.1'), true);
    assert.equal(isAutomationBranch('back-merge/v1.4.0'), true);
    assert.equal(isAutomationBranch('feature/login'), false);
  });

  it('recognizes the release candidates of a version', () => {
    assert.equal(isReleaseCandidateTagOf('v1.4.0-rc.1', '1.4.0'), true);
    assert.equal(isReleaseCandidateTagOf('v1.4.0', '1.4.0'), false);
    assert.equal(isReleaseCandidateTagOf('v1.4.1-rc.1', '1.4.0'), false);
  });
});

describe('extractStableVersions', () => {
  it('ignores release candidates and unrelated tags', () => {
    const tagNames = ['v1.0.0', 'v1.1.0-rc.1', 'v1.1.0', 'nightly', '2.0.0', 'v2'];

    assert.deepEqual(extractStableVersions(tagNames), ['1.0.0', '1.1.0']);
  });
});

describe('findNextReleaseCandidateNumber', () => {
  it('starts at 1', () => {
    assert.equal(findNextReleaseCandidateNumber(['v1.3.0', 'v1.3.0-rc.1'], '1.4.0'), 1);
  });

  it('continues after the highest existing number', () => {
    const tagNames = ['v1.4.0-rc.1', 'v1.4.0-rc.10', 'v1.4.0-rc.2', 'v1.4.1-rc.30'];

    assert.equal(findNextReleaseCandidateNumber(tagNames, '1.4.0'), 11);
  });
});

describe('evaluateBranchPolicy', () => {
  const productionBranch = 'main';

  it('accepts any branch into a branch that is not production', () => {
    const evaluation = evaluateBranchPolicy({
      sourceBranch: 'feature/login',
      targetBranch: 'develop',
      productionBranch,
      isFromFork: false,
    });

    assert.deepEqual(evaluation, { isAllowed: true, violation: null });
  });

  it('accepts release and hotfix branches into production', () => {
    for (const sourceBranch of ['release/1.4.0', 'hotfix/1.4.1']) {
      const evaluation = evaluateBranchPolicy({ sourceBranch, targetBranch: 'main', productionBranch, isFromFork: false });

      assert.equal(evaluation.isAllowed, true);
    }
  });

  it('refuses any other branch into production', () => {
    for (const sourceBranch of ['develop', 'feature/login', 'release/next', 'back-merge/v1.4.0']) {
      const evaluation = evaluateBranchPolicy({ sourceBranch, targetBranch: 'main', productionBranch, isFromFork: false });

      assert.equal(evaluation.isAllowed, false);
      assert.equal(evaluation.violation, PolicyViolation.SOURCE_NOT_ALLOWED_INTO_PRODUCTION);
    }
  });

  it('refuses a fork into production, even with a release branch name', () => {
    const evaluation = evaluateBranchPolicy({
      sourceBranch: 'release/1.4.0',
      targetBranch: 'main',
      productionBranch,
      isFromFork: true,
    });

    assert.equal(evaluation.violation, PolicyViolation.FORK_NOT_ALLOWED_INTO_PRODUCTION);
  });

  it('uses the configured production branch name', () => {
    const evaluation = evaluateBranchPolicy({
      sourceBranch: 'feature/login',
      targetBranch: 'master',
      productionBranch: 'master',
      isFromFork: false,
    });

    assert.equal(evaluation.isAllowed, false);
  });
});
