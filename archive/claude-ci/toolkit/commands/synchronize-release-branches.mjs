/**
 * After a hotfix is published while a release is being prepared, brings the
 * hotfix into the open release branch so its pull request stays mergeable.
 *
 * Both branches changed the version of the project, which would always end in
 * a conflict. To avoid it, the release branch first takes the exact version of
 * production, then merges production, then gets its own version back.
 *
 * Parameters (environment variables):
 *   RELEASED_VERSION         Version that was just published.
 *   PRODUCTION_BRANCH        Name of the production branch.
 *   PROJECT_TYPE             node, flutter or extension.
 *   EXTENSION_MANIFEST_PATH  Optional path of the manifest.json (extension projects).
 *   GH_TOKEN                 Token of the automation GitHub App.
 */

import { FlowKind, parseFlowBranch } from '../core/flow-branches.mjs';
import { compareSemanticVersions } from '../core/semantic-version.mjs';
import { computeNextBuildNumber } from '../core/version-files.mjs';
import { readRequiredVariable } from '../infrastructure/environment.mjs';
import {
  buildRemoteRevision,
  checkoutBranchAtRevision,
  commitFiles,
  isAncestor,
  listRemoteBranchNames,
  pushCurrentCommitToBranch,
  resetCurrentBranchTo,
  tryMergeRevision,
} from '../infrastructure/git-repository.mjs';
import { commentOnPullRequest, findOpenPullRequestUrl } from '../infrastructure/github-client.mjs';
import {
  listVersionFiles,
  loadProjectConfiguration,
  readProjectVersionAtRevision,
  writeProjectVersion,
} from '../infrastructure/project-version.mjs';
import {
  WorkflowFailure,
  reportInformation,
  reportSuccess,
  runWorkflowCommand,
} from '../infrastructure/workflow-report.mjs';

/**
 * @typedef {object} SynchronizationContext
 * @property {string} releasedVersion
 * @property {string} productionBranch
 * @property {import('../infrastructure/project-version.mjs').ProjectConfiguration} projectConfiguration
 */

/**
 * @param {SynchronizationContext} context
 * @param {string} branchName
 * @param {string} branchVersion
 */
function assertReleaseVersionIsStillAhead(context, branchName, branchVersion) {
  if (compareSemanticVersions(branchVersion, context.releasedVersion) > 0) {
    return;
  }

  throw new WorkflowFailure(`La release ${branchVersion} doit changer de version`, [
    `La version ${context.releasedVersion} vient d'être publiée : la branche « ${branchName} » ne peut plus publier la version ${branchVersion}, qui n'est plus supérieure à la production.`,
    `Supprimez la branche « ${branchName} » puis relancez « Start release » : le pipeline recalculera la version. Si cette branche contient des correctifs faits directement dessus, mergez-la d'abord dans la branche d'intégration pour ne pas les perdre.`,
  ]);
}

/**
 * @param {SynchronizationContext} context
 * @param {string} branchName
 * @returns {WorkflowFailure}
 */
function buildConflictFailure(context, branchName) {
  const instructions = [
    `Le hotfix ${context.releasedVersion} n'a pas pu être intégré automatiquement dans \`${branchName}\` : les deux branches modifient les mêmes lignes.`,
    `À faire en local :\n\`\`\`\ngit fetch origin\ngit switch ${branchName}\ngit pull\ngit merge origin/${context.productionBranch}\n\`\`\``,
    `Résolvez les conflits en gardant le correctif du hotfix. Pour les fichiers de version, conservez la version de \`${branchName}\`. Terminez avec \`git commit\` puis \`git push\`.`,
  ];

  const pullRequestUrl = findOpenPullRequestUrl(branchName, context.productionBranch);

  if (pullRequestUrl !== null) {
    commentOnPullRequest(pullRequestUrl, [`### ⚠️ Conflit avec le hotfix ${context.releasedVersion}`, ...instructions].join('\n\n'));
  }

  return new WorkflowFailure(`Conflit entre le hotfix ${context.releasedVersion} et « ${branchName} »`, instructions);
}

/**
 * @param {SynchronizationContext} context
 * @param {string} branchName
 * @param {string} branchVersion
 */
function mergeProductionIntoReleaseBranch(context, branchName, branchVersion) {
  const productionRevision = buildRemoteRevision(context.productionBranch);
  const releaseRevision = buildRemoteRevision(branchName);
  const productionVersion = readProjectVersionAtRevision(context.projectConfiguration, productionRevision);

  checkoutBranchAtRevision(branchName, releaseRevision);

  /* Same version on both sides: git sees no difference to reconcile in the version files. */
  writeProjectVersion(context.projectConfiguration, productionVersion);
  commitFiles(
    listVersionFiles(context.projectConfiguration),
    `chore(release): align version with ${context.productionBranch} before merge`,
  );

  const isMerged = tryMergeRevision(
    productionRevision,
    `chore(release): merge v${context.releasedVersion} into ${branchName}`,
  );

  if (!isMerged) {
    resetCurrentBranchTo(releaseRevision);
    throw buildConflictFailure(context, branchName);
  }

  writeProjectVersion(context.projectConfiguration, {
    version: branchVersion,
    buildNumber: computeNextBuildNumber(productionVersion.buildNumber),
  });
  commitFiles(listVersionFiles(context.projectConfiguration), `chore(release): restore version ${branchVersion}`);

  pushCurrentCommitToBranch(branchName);
}

/**
 * @param {SynchronizationContext} context
 * @param {string} branchName
 */
function synchronizeReleaseBranch(context, branchName) {
  const flowBranch = parseFlowBranch(branchName);

  /* Ignores oddly named branches, and the branch of the version that was just published. */
  if (flowBranch === null || flowBranch.version === context.releasedVersion) {
    return;
  }

  if (isAncestor(buildRemoteRevision(context.productionBranch), buildRemoteRevision(branchName))) {
    reportInformation(`« ${branchName} » est déjà à jour`, [
      `Cette branche contient déjà tout le contenu de « ${context.productionBranch} ».`,
    ]);
    return;
  }

  assertReleaseVersionIsStillAhead(context, branchName, flowBranch.version);
  mergeProductionIntoReleaseBranch(context, branchName, flowBranch.version);

  reportSuccess(`« ${branchName} » mise à jour avec la version ${context.releasedVersion}`, [
    `Le contenu publié a été intégré dans la release en cours, qui conserve sa version ${flowBranch.version}.`,
    'Sa pull request reste mergeable sans intervention.',
  ]);
}

function synchronizeReleaseBranches() {
  const context = {
    releasedVersion: readRequiredVariable('RELEASED_VERSION'),
    productionBranch: readRequiredVariable('PRODUCTION_BRANCH'),
    projectConfiguration: loadProjectConfiguration(),
  };

  const releaseBranches = listRemoteBranchNames(`${FlowKind.RELEASE}/`);

  if (releaseBranches.length === 0) {
    reportInformation('Aucune release en cours à mettre à jour');
    return;
  }

  for (const branchName of releaseBranches) {
    synchronizeReleaseBranch(context, branchName);
  }
}

await runWorkflowCommand(synchronizeReleaseBranches);
