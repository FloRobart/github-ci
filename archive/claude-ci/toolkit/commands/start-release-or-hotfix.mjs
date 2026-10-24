/**
 * Starts a release (from the integration branch) or a hotfix (from the
 * production branch): computes the version, creates the branch, writes the
 * version in the project files and opens the pull request to production.
 *
 * Parameters (environment variables):
 *   FLOW_KIND                "release" or "hotfix".
 *   REQUESTED_BUMP           "auto", "patch", "minor" or "major" (releases only).
 *   PRODUCTION_BRANCH        Name of the production branch.
 *   INTEGRATION_BRANCH       Name of the integration branch.
 *   PROJECT_TYPE             node, flutter or extension.
 *   EXTENSION_MANIFEST_PATH  Optional path of the manifest.json (extension projects).
 *   GH_TOKEN                 Token of the automation GitHub App.
 *
 * Outputs: version, branch, pull-request-url.
 */

import { buildChangelog } from '../core/changelog.mjs';
import { FlowKind, buildFlowBranchName } from '../core/flow-branches.mjs';
import { AUTOMATIC_BUMP, VersionOrigin, planReleaseVersion } from '../core/release-plan.mjs';
import { BumpLevel, incrementSemanticVersion } from '../core/semantic-version.mjs';
import { computeNextBuildNumber } from '../core/version-files.mjs';
import { readChoiceVariable, readRequiredVariable } from '../infrastructure/environment.mjs';
import {
  buildRemoteRevision,
  checkoutBranchAtRevision,
  commitFiles,
  isAncestor,
  listCommitHashes,
  listRemoteBranchNames,
  listRemoteTags,
  pushCurrentCommitToBranch,
  remoteBranchExists,
} from '../infrastructure/git-repository.mjs';
import { createPullRequest } from '../infrastructure/github-client.mjs';
import {
  listVersionFiles,
  loadProjectConfiguration,
  readProjectVersionAtRevision,
  writeProjectVersion,
} from '../infrastructure/project-version.mjs';
import {
  WorkflowFailure,
  reportSuccess,
  runWorkflowCommand,
  setOutput,
} from '../infrastructure/workflow-report.mjs';
import { findLatestRelease, listPullRequestsMergedSince } from '../services/release-history.mjs';

const BUMP_LEVEL_LABELS = {
  [BumpLevel.MAJOR]: 'majeure',
  [BumpLevel.MINOR]: 'mineure',
  [BumpLevel.PATCH]: 'correctif',
};

const FLOW_KIND_LABELS = {
  [FlowKind.RELEASE]: 'Release',
  [FlowKind.HOTFIX]: 'Hotfix',
};

/* ========================================================================== */
/* Section 1 : Context and safety checks                                      */
/* ========================================================================== */

/**
 * @typedef {object} StartContext
 * @property {string} kind One of the FlowKind values.
 * @property {string} requestedBump
 * @property {string} productionBranch
 * @property {string} integrationBranch
 * @property {import('../infrastructure/project-version.mjs').ProjectConfiguration} projectConfiguration
 */

/**
 * @returns {StartContext}
 */
function loadStartContext() {
  return {
    kind: readChoiceVariable('FLOW_KIND', Object.values(FlowKind)),
    requestedBump: readChoiceVariable('REQUESTED_BUMP', [AUTOMATIC_BUMP, ...Object.values(BumpLevel)]),
    productionBranch: readRequiredVariable('PRODUCTION_BRANCH'),
    integrationBranch: readRequiredVariable('INTEGRATION_BRANCH'),
    projectConfiguration: loadProjectConfiguration(),
  };
}

/**
 * @param {string} branchName
 */
function assertRemoteBranchExists(branchName) {
  if (remoteBranchExists(branchName)) {
    return;
  }

  throw new WorkflowFailure(`La branche « ${branchName} » n'existe pas`, [
    'Le Git workflow a besoin de cette branche sur le dépôt GitHub.',
    'Créez-la, ou corrigez les paramètres « production-branch » et « integration-branch » transmis au workflow si vos branches portent un autre nom.',
  ]);
}

/**
 * Only one release and one hotfix can be in progress at a time: two branches
 * of the same kind would compete for the same version number.
 *
 * @param {string} kind
 */
function assertNoBranchInProgress(kind) {
  const branchesInProgress = listRemoteBranchNames(`${kind}/`);

  if (branchesInProgress.length === 0) {
    return;
  }

  throw new WorkflowFailure(`Une branche ${kind} est déjà en cours`, [
    `Branche existante : « ${branchesInProgress.join(' », « ')} ».`,
    'Terminez-la en mergeant sa pull request, ou supprimez cette branche si vous voulez repartir de zéro, puis relancez ce workflow.',
  ]);
}

/**
 * @param {StartContext} context
 */
function assertIntegrationContainsProduction(context) {
  const productionRevision = buildRemoteRevision(context.productionBranch);
  const integrationRevision = buildRemoteRevision(context.integrationBranch);

  if (isAncestor(productionRevision, integrationRevision)) {
    return;
  }

  throw new WorkflowFailure(`« ${context.integrationBranch} » n'est pas à jour avec « ${context.productionBranch} »`, [
    `Des commits de « ${context.productionBranch} » (une release ou un hotfix déjà publié) ne sont pas encore revenus dans « ${context.integrationBranch} ».`,
    'Mergez d\'abord la pull request de back-merge ouverte par le pipeline (branche « back-merge/… »), puis relancez ce workflow. Sans cela, la release entrerait en conflit avec la production.',
  ]);
}

/**
 * @param {StartContext} context
 */
function assertIntegrationHasNewCommits(context) {
  const productionRevision = buildRemoteRevision(context.productionBranch);
  const integrationRevision = buildRemoteRevision(context.integrationBranch);
  const newCommitHashes = listCommitHashes(`${productionRevision}..${integrationRevision}`);

  if (newCommitHashes.length > 0) {
    return;
  }

  throw new WorkflowFailure('Rien à publier', [
    `« ${context.integrationBranch} » ne contient aucun commit qui ne soit pas déjà dans « ${context.productionBranch} ».`,
    `Mergez au moins une pull request dans « ${context.integrationBranch} » avant de démarrer une release.`,
  ]);
}

/* ========================================================================== */
/* Section 2 : Version planning                                               */
/* ========================================================================== */

/**
 * @typedef {object} StartPlan
 * @property {string} version Version of the branch to create.
 * @property {string | null} previousVersion Latest published version.
 * @property {string | null} bumpLevel
 * @property {string} versionExplanation Sentence telling the user where the version comes from.
 * @property {boolean} mustWriteVersion false when the project files already hold the right version.
 * @property {string} baseBranch Branch the new branch starts from.
 * @property {import('../core/changelog.mjs').MergedPullRequest[]} includedPullRequests
 */

/**
 * @param {import('../core/release-plan.mjs').ReleaseVersionPlan} versionPlan
 * @returns {string}
 */
function explainReleaseVersion(versionPlan) {
  const bumpLabel = BUMP_LEVEL_LABELS[versionPlan.bumpLevel];

  const explanationsByOrigin = {
    [VersionOrigin.INITIAL_RELEASE]:
      'première publication du projet : la version déjà écrite dans les fichiers est conservée.',
    [VersionOrigin.PROJECT_VERSION_AHEAD]:
      'la version écrite dans les fichiers du projet est déjà supérieure à celle calculée : elle est conservée.',
    [VersionOrigin.REQUESTED_BUMP]:
      `montée ${bumpLabel}, demandée manuellement au lancement du workflow.`,
    [VersionOrigin.PULL_REQUEST_TITLES]:
      `montée ${bumpLabel}, déduite des titres de pull requests (${describeDecisivePullRequests(versionPlan)}).`,
  };

  return explanationsByOrigin[versionPlan.origin];
}

/**
 * @param {import('../core/release-plan.mjs').ReleaseVersionPlan} versionPlan
 * @returns {string}
 */
function describeDecisivePullRequests(versionPlan) {
  if (versionPlan.decisivePullRequests.length === 0) {
    return 'aucune pull request référencée, montée minimale appliquée';
  }

  const pullRequestNumbers = versionPlan.decisivePullRequests.map((pullRequest) => `#${pullRequest.number}`);

  return `décidée par ${pullRequestNumbers.join(', ')}`;
}

/**
 * @param {StartContext} context
 * @returns {StartPlan}
 */
function planRelease(context) {
  assertIntegrationContainsProduction(context);
  assertIntegrationHasNewCommits(context);

  const integrationRevision = buildRemoteRevision(context.integrationBranch);
  const latestRelease = findLatestRelease(listRemoteTags());
  const includedPullRequests = listPullRequestsMergedSince(latestRelease, integrationRevision);
  const currentProjectVersion = readProjectVersionAtRevision(context.projectConfiguration, integrationRevision);

  const versionPlan = planReleaseVersion({
    latestReleasedVersion: latestRelease?.version ?? null,
    currentProjectVersion: currentProjectVersion.version,
    requestedBump: context.requestedBump,
    unreleasedPullRequests: includedPullRequests,
  });

  return {
    version: versionPlan.version,
    previousVersion: latestRelease?.version ?? null,
    bumpLevel: versionPlan.bumpLevel,
    versionExplanation: explainReleaseVersion(versionPlan),
    mustWriteVersion: versionPlan.origin !== VersionOrigin.INITIAL_RELEASE,
    baseBranch: context.integrationBranch,
    includedPullRequests,
  };
}

/**
 * @param {StartContext} context
 * @returns {StartPlan}
 */
function planHotfix(context) {
  const latestRelease = findLatestRelease(listRemoteTags());

  if (latestRelease === null) {
    throw new WorkflowFailure('Aucune version publiée à corriger', [
      'Un hotfix corrige une version déjà en production, or ce dépôt ne possède encore aucun tag de version (« vX.Y.Z »).',
      'Publiez une première version avec le workflow « Start release ».',
    ]);
  }

  return {
    version: incrementSemanticVersion(latestRelease.version, BumpLevel.PATCH),
    previousVersion: latestRelease.version,
    bumpLevel: BumpLevel.PATCH,
    versionExplanation: 'montée correctif, toujours appliquée pour un hotfix.',
    mustWriteVersion: true,
    baseBranch: context.productionBranch,
    includedPullRequests: [],
  };
}

/* ========================================================================== */
/* Section 3 : Branch and pull request                                        */
/* ========================================================================== */

/**
 * @param {StartContext} context
 * @param {StartPlan} plan
 * @returns {string} Name of the branch pushed to the remote.
 */
function createVersionBranch(context, plan) {
  const branchName = buildFlowBranchName(context.kind, plan.version);

  checkoutBranchAtRevision(branchName, buildRemoteRevision(plan.baseBranch));

  if (plan.mustWriteVersion) {
    const productionRevision = buildRemoteRevision(context.productionBranch);
    const productionVersion = readProjectVersionAtRevision(context.projectConfiguration, productionRevision);

    writeProjectVersion(context.projectConfiguration, {
      version: plan.version,
      buildNumber: computeNextBuildNumber(productionVersion.buildNumber),
    });

    commitFiles(listVersionFiles(context.projectConfiguration), buildFlowTitle(context.kind, plan.version));
  }

  pushCurrentCommitToBranch(branchName);

  return branchName;
}

/**
 * Used for both the version commit and the pull request, so it must follow
 * the Conventional Commits format checked on every pull request.
 *
 * @param {string} kind
 * @param {string} version
 * @returns {string}
 */
function buildFlowTitle(kind, version) {
  return `chore(${kind}): ${version}`;
}

/**
 * @param {StartContext} context
 * @param {StartPlan} plan
 * @param {string} branchName
 * @returns {string} Markdown body of the pull request.
 */
function buildPullRequestBody(context, plan, branchName) {
  const versionLine = `**Version** : ${plan.previousVersion ?? 'aucune'} → **${plan.version}** — ${plan.versionExplanation}`;

  if (context.kind === FlowKind.HOTFIX) {
    return [
      `## 🚑 Hotfix ${plan.version}`,
      versionLine,
      '## Étapes',
      [
        `1. Poussez le correctif sur \`${branchName}\` (commit direct, ou pull request vers cette branche).`,
        `2. (Optionnel) Lancez le workflow **Release candidate** sur la branche \`${branchName}\` pour publier une version de test.`,
        `3. Mergez cette pull request : la version ${plan.version} est alors publiée, puis reportée automatiquement vers \`${context.integrationBranch}\`.`,
      ].join('\n'),
    ].join('\n\n');
  }

  return [
    `## 🚀 Release ${plan.version}`,
    versionLine,
    '## Contenu',
    buildChangelog(plan.includedPullRequests),
    '## Étapes',
    [
      `1. (Optionnel) Lancez le workflow **Release candidate** sur la branche \`${branchName}\` pour publier une version de test.`,
      `2. Si un correctif est nécessaire, ouvrez une pull request vers \`${branchName}\`.`,
      `3. Mergez cette pull request : la version ${plan.version} est alors publiée, puis reportée automatiquement vers \`${context.integrationBranch}\`.`,
    ].join('\n'),
  ].join('\n\n');
}

/* ========================================================================== */
/* Section 4 : Command                                                        */
/* ========================================================================== */

function startReleaseOrHotfix() {
  const context = loadStartContext();

  assertRemoteBranchExists(context.productionBranch);
  assertRemoteBranchExists(context.integrationBranch);
  assertNoBranchInProgress(context.kind);

  const plan = context.kind === FlowKind.HOTFIX ? planHotfix(context) : planRelease(context);
  const branchName = createVersionBranch(context, plan);

  const pullRequestUrl = createPullRequest({
    headBranch: branchName,
    baseBranch: context.productionBranch,
    title: buildFlowTitle(context.kind, plan.version),
    body: buildPullRequestBody(context, plan, branchName),
  });

  setOutput('version', plan.version);
  setOutput('branch', branchName);
  setOutput('pull-request-url', pullRequestUrl);

  reportSuccess(`${FLOW_KIND_LABELS[context.kind]} ${plan.version} démarrée`, [
    `Branche créée : \`${branchName}\`, à partir de \`${plan.baseBranch}\`.`,
    `Version : ${plan.previousVersion ?? 'aucune'} → ${plan.version} — ${plan.versionExplanation}`,
    `Pull request vers \`${context.productionBranch}\` : ${pullRequestUrl}`,
    'Prochaine étape : ouvrez cette pull request, les étapes à suivre y sont décrites.',
  ]);
}

await runWorkflowCommand(startReleaseOrHotfix);
