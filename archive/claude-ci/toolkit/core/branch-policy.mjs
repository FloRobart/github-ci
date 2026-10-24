/**
 * Decides whether a pull request is allowed, based on its source and target branches.
 *
 * The production branch only accepts release/x.y.z and hotfix/x.y.z branches of
 * the repository itself. Every other target accepts any source branch.
 */

import { parseFlowBranch } from './flow-branches.mjs';

export const PolicyViolation = Object.freeze({
  SOURCE_NOT_ALLOWED_INTO_PRODUCTION: 'source-not-allowed-into-production',
  FORK_NOT_ALLOWED_INTO_PRODUCTION: 'fork-not-allowed-into-production',
});

/**
 * @param {object} pullRequest
 * @param {string} pullRequest.sourceBranch
 * @param {string} pullRequest.targetBranch
 * @param {string} pullRequest.productionBranch
 * @param {boolean} pullRequest.isFromFork
 * @returns {{ isAllowed: boolean, violation: string | null }}
 */
export function evaluateBranchPolicy(pullRequest) {
  const { sourceBranch, targetBranch, productionBranch, isFromFork } = pullRequest;

  if (targetBranch !== productionBranch) {
    return { isAllowed: true, violation: null };
  }

  /* A fork could name one of its branches "release/1.0.0" to get around the rule. */
  if (isFromFork) {
    return { isAllowed: false, violation: PolicyViolation.FORK_NOT_ALLOWED_INTO_PRODUCTION };
  }

  if (parseFlowBranch(sourceBranch) === null) {
    return { isAllowed: false, violation: PolicyViolation.SOURCE_NOT_ALLOWED_INTO_PRODUCTION };
  }

  return { isAllowed: true, violation: null };
}
