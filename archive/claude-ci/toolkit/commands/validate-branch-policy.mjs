/**
 * Checks that the source branch of a pull request is allowed into its target branch.
 *
 * Parameters (environment variables):
 *   SOURCE_BRANCH      Branch the pull request comes from.
 *   TARGET_BRANCH      Branch the pull request goes into.
 *   PRODUCTION_BRANCH  Name of the production branch.
 *   IS_FROM_FORK       "true" when the source branch belongs to a fork.
 */

import { PolicyViolation, evaluateBranchPolicy } from '../core/branch-policy.mjs';
import { readOptionalVariable, readRequiredVariable } from '../infrastructure/environment.mjs';
import { WorkflowFailure, reportSuccess, runWorkflowCommand } from '../infrastructure/workflow-report.mjs';

/**
 * @param {string} violation One of the PolicyViolation values.
 * @param {string} sourceBranch
 * @param {string} productionBranch
 * @returns {WorkflowFailure}
 */
function buildPolicyFailure(violation, sourceBranch, productionBranch) {
  const title = `Pull request refusée vers « ${productionBranch} »`;
  const rule = `La branche « ${productionBranch} » représente la production : elle n'accepte que des pull requests venant d'une branche « release/x.y.z » ou « hotfix/x.y.z » de ce dépôt.`;

  if (violation === PolicyViolation.FORK_NOT_ALLOWED_INTO_PRODUCTION) {
    return new WorkflowFailure(title, [
      rule,
      `Cette pull request vient d'un fork (branche « ${sourceBranch} »). Changez sa branche cible vers la branche d'intégration.`,
    ]);
  }

  return new WorkflowFailure(title, [
    rule,
    `Branche source reçue : « ${sourceBranch} ».`,
    "Que faire ?\n- Pour une fonctionnalité ou un correctif classique : changez la branche cible de cette pull request vers la branche d'intégration (bouton « Edit » à côté du titre).\n- Pour publier une nouvelle version : lancez le workflow « Start release » depuis l'onglet Actions.\n- Pour corriger la production en urgence : lancez le workflow « Start hotfix » depuis l'onglet Actions.",
  ]);
}

function validateBranchPolicy() {
  const sourceBranch = readRequiredVariable('SOURCE_BRANCH');
  const targetBranch = readRequiredVariable('TARGET_BRANCH');
  const productionBranch = readRequiredVariable('PRODUCTION_BRANCH');
  const isFromFork = readOptionalVariable('IS_FROM_FORK') === 'true';

  const evaluation = evaluateBranchPolicy({ sourceBranch, targetBranch, productionBranch, isFromFork });

  if (!evaluation.isAllowed) {
    throw buildPolicyFailure(evaluation.violation, sourceBranch, productionBranch);
  }

  reportSuccess('Branches conformes au Git workflow', [
    `« ${sourceBranch} » → « ${targetBranch} » : autorisé.`,
  ]);
}

await runWorkflowCommand(validateBranchPolicy);
