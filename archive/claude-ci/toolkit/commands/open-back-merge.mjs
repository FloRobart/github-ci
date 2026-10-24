/**
 * Carries a published version back into the integration branch: opens a pull
 * request from a "back-merge/vX.Y.Z" branch and asks GitHub to merge it as
 * soon as its checks pass.
 *
 * Parameters (environment variables):
 *   RELEASED_VERSION    Version that was just published.
 *   PRODUCTION_BRANCH   Name of the production branch.
 *   INTEGRATION_BRANCH  Name of the integration branch.
 *   GH_TOKEN            Token of the automation GitHub App.
 *
 * Outputs: pull-request-url (empty when no back-merge is needed).
 */

import { buildBackMergeBranchName } from '../core/flow-branches.mjs';
import { readRequiredVariable } from '../infrastructure/environment.mjs';
import {
  buildRemoteRevision,
  createRemoteBranch,
  isAncestor,
  remoteBranchExists,
} from '../infrastructure/git-repository.mjs';
import {
  MergeRequestOutcome,
  createPullRequest,
  findOpenPullRequestUrl,
  requestMergeWhenChecksPass,
} from '../infrastructure/github-client.mjs';
import {
  WorkflowFailure,
  reportInformation,
  reportSuccess,
  reportWarning,
  runWorkflowCommand,
  setOutput,
} from '../infrastructure/workflow-report.mjs';

/**
 * @param {string} version
 * @param {string} productionBranch
 * @param {string} integrationBranch
 * @param {string} backMergeBranch
 * @returns {string} Markdown body of the pull request.
 */
function buildPullRequestBody(version, productionBranch, integrationBranch, backMergeBranch) {
  return [
    `## 🔁 Back-merge de la version ${version}`,
    `Reporte dans \`${integrationBranch}\` tout ce qui vient d'être publié sur \`${productionBranch}\`, numéro de version compris.`,
    'Cette pull request est mergée automatiquement dès que ses vérifications passent : il n\'y a normalement rien à faire.',
    `**En cas de conflit** : résolvez-le sur la branche \`${backMergeBranch}\` (éditeur de conflits de GitHub ou en local), le merge automatique reprend ensuite tout seul.`,
    `**Si vous la mergez à la main** : choisissez « Create a merge commit », jamais « Squash ». Un squash couperait le lien entre \`${integrationBranch}\` et l'historique de \`${productionBranch}\`, ce qui bloquerait la prochaine release.`,
  ].join('\n\n');
}

/**
 * @param {string} outcome One of the MergeRequestOutcome values.
 * @param {string} pullRequestUrl
 * @param {string} integrationBranch
 */
function reportOutcome(outcome, pullRequestUrl, integrationBranch) {
  if (outcome === MergeRequestOutcome.MERGED) {
    reportSuccess(`Back-merge effectué vers « ${integrationBranch} »`, [`Pull request mergée : ${pullRequestUrl}`]);
    return;
  }

  if (outcome === MergeRequestOutcome.SCHEDULED) {
    reportSuccess(`Back-merge programmé vers « ${integrationBranch} »`, [
      `Pull request : ${pullRequestUrl}`,
      'Elle sera mergée automatiquement dès que ses vérifications auront réussi. En cas de conflit, la marche à suivre est indiquée dans la pull request.',
    ]);
    return;
  }

  reportWarning('Back-merge à terminer manuellement', [
    `La pull request est ouverte, mais GitHub a refusé de programmer son merge automatique : ${pullRequestUrl}`,
    'Cause la plus fréquente : l\'option « Allow auto-merge » n\'est pas activée dans Settings → General du dépôt.',
    'Mergez cette pull request avec « Create a merge commit » une fois ses vérifications réussies.',
  ]);
}

function openBackMerge() {
  const version = readRequiredVariable('RELEASED_VERSION');
  const productionBranch = readRequiredVariable('PRODUCTION_BRANCH');
  const integrationBranch = readRequiredVariable('INTEGRATION_BRANCH');
  const productionRevision = buildRemoteRevision(productionBranch);

  if (!remoteBranchExists(integrationBranch)) {
    throw new WorkflowFailure(`La branche « ${integrationBranch} » n'existe pas`, [
      `Le back-merge reporte la version publiée dans « ${integrationBranch} », mais cette branche est introuvable sur le dépôt.`,
      `Créez-la à partir de « ${productionBranch} », ou corrigez le paramètre « integration-branch » transmis au workflow.`,
    ]);
  }

  if (isAncestor(productionRevision, buildRemoteRevision(integrationBranch))) {
    setOutput('pull-request-url', '');
    reportInformation('Back-merge inutile', [
      `« ${integrationBranch} » contient déjà tout le contenu de « ${productionBranch} ».`,
    ]);
    return;
  }

  const backMergeBranch = buildBackMergeBranchName(version);

  if (!remoteBranchExists(backMergeBranch)) {
    createRemoteBranch(backMergeBranch, productionRevision);
  }

  const pullRequestUrl = findOpenPullRequestUrl(backMergeBranch, integrationBranch) ?? createPullRequest({
    headBranch: backMergeBranch,
    baseBranch: integrationBranch,
    title: `chore(release): back-merge v${version} vers ${integrationBranch}`,
    body: buildPullRequestBody(version, productionBranch, integrationBranch, backMergeBranch),
  });

  setOutput('pull-request-url', pullRequestUrl);
  reportOutcome(requestMergeWhenChecksPass(pullRequestUrl), pullRequestUrl, integrationBranch);
}

await runWorkflowCommand(openBackMerge);
