/**
 * Checks that a pull request into the production branch carries a version that
 * can really be published: same version in the branch name and in the project
 * files, and higher than everything already published.
 *
 * Parameters (environment variables):
 *   SOURCE_BRANCH            Branch the pull request comes from.
 *   PROJECT_TYPE             node, flutter or extension.
 *   EXTENSION_MANIFEST_PATH  Optional path of the manifest.json (extension projects).
 */

import { extractStableVersions, parseFlowBranch } from '../core/flow-branches.mjs';
import { compareSemanticVersions, findHighestSemanticVersion } from '../core/semantic-version.mjs';
import { readRequiredVariable } from '../infrastructure/environment.mjs';
import { listRemoteTags } from '../infrastructure/git-repository.mjs';
import { loadProjectConfiguration, readProjectVersion } from '../infrastructure/project-version.mjs';
import {
  WorkflowFailure,
  reportInformation,
  reportSuccess,
  runWorkflowCommand,
} from '../infrastructure/workflow-report.mjs';

const RESTART_ADVICE =
  'Le plus simple est de supprimer cette branche et de relancer « Start release » (ou « Start hotfix ») depuis l\'onglet Actions : le pipeline recalcule la version et prépare la branche.';

/**
 * @param {string} sourceBranch
 * @param {string} branchVersion
 * @param {string} projectVersion
 */
function assertProjectVersionMatchesBranch(sourceBranch, branchVersion, projectVersion) {
  if (projectVersion === branchVersion) {
    return;
  }

  throw new WorkflowFailure('La version du projet ne correspond pas à la branche', [
    `La branche « ${sourceBranch} » annonce la version ${branchVersion}, mais les fichiers du projet indiquent ${projectVersion}.`,
    `Les deux doivent être identiques. ${RESTART_ADVICE}`,
  ]);
}

/**
 * @param {string} version
 * @param {string[]} publishedVersions
 */
function assertVersionIsNew(version, publishedVersions) {
  if (publishedVersions.includes(version)) {
    throw new WorkflowFailure(`La version ${version} est déjà publiée`, [
      `Le tag « v${version} » existe déjà : une version publiée ne peut pas être publiée une seconde fois.`,
      RESTART_ADVICE,
    ]);
  }

  const latestPublishedVersion = findHighestSemanticVersion(publishedVersions);

  if (latestPublishedVersion !== null && compareSemanticVersions(version, latestPublishedVersion) < 0) {
    throw new WorkflowFailure(`La version ${version} est inférieure à la dernière version publiée`, [
      `Dernière version publiée : ${latestPublishedVersion}. Une nouvelle version doit toujours être supérieure.`,
      RESTART_ADVICE,
    ]);
  }
}

function validateReleasePullRequest() {
  const sourceBranch = readRequiredVariable('SOURCE_BRANCH');
  const flowBranch = parseFlowBranch(sourceBranch);

  if (flowBranch === null) {
    reportInformation('Vérification de la version ignorée', [
      `« ${sourceBranch} » n'est pas une branche release ou hotfix : la pull request est déjà refusée par la vérification des branches.`,
    ]);
    return;
  }

  const projectVersion = readProjectVersion(loadProjectConfiguration()).version;
  const publishedVersions = extractStableVersions(listRemoteTags().map((tag) => tag.name));

  assertProjectVersionMatchesBranch(sourceBranch, flowBranch.version, projectVersion);
  assertVersionIsNew(flowBranch.version, publishedVersions);

  reportSuccess(`Version ${flowBranch.version} prête à être publiée`, [
    `La branche et les fichiers du projet indiquent tous la version ${flowBranch.version}, qui n'a encore jamais été publiée.`,
    'En mergeant cette pull request, la version sera publiée automatiquement.',
  ]);
}

await runWorkflowCommand(validateReleasePullRequest);
