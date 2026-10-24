/**
 * Publishes the version found on the production branch: creates the "vX.Y.Z"
 * tag and the GitHub Release, then deletes the merged release or hotfix branch.
 *
 * Parameters (environment variables):
 *   GITHUB_SHA               Commit to publish (set by GitHub).
 *   PROJECT_TYPE             node, flutter or extension.
 *   EXTENSION_MANIFEST_PATH  Optional path of the manifest.json (extension projects).
 *   RELEASE_NAME             Optional project name used in the release title.
 *   GH_TOKEN                 Token of the automation GitHub App.
 *
 * Outputs:
 *   version         Version found in the project files.
 *   tag             Tag of that version.
 *   should-publish  "true" when this commit is the published version and its
 *                   artifacts (images, archives) must be built.
 */

import { FlowKind, buildFlowBranchName, buildVersionTag } from '../core/flow-branches.mjs';
import { readOptionalVariable, readRequiredVariable } from '../infrastructure/environment.mjs';
import {
  listRemoteTags,
  remoteBranchExists,
  tryDeleteRemoteBranch,
} from '../infrastructure/git-repository.mjs';
import {
  buildRepositoryDisplayName,
  createRelease,
  releaseExists,
} from '../infrastructure/github-client.mjs';
import { loadProjectConfiguration, readProjectVersion } from '../infrastructure/project-version.mjs';
import {
  reportSuccess,
  reportWarning,
  runWorkflowCommand,
  setOutput,
} from '../infrastructure/workflow-report.mjs';
import {
  buildReleaseNotes,
  findLatestRelease,
  listPullRequestsMergedSince,
} from '../services/release-history.mjs';

/**
 * @param {string} version
 * @param {string} commitHash
 * @param {{ name: string, commitHash: string }[]} remoteTags
 */
function createStableRelease(version, commitHash, remoteTags) {
  const tagName = buildVersionTag(version);
  const previousRelease = findLatestRelease(remoteTags, version);
  const projectName = readOptionalVariable('RELEASE_NAME', buildRepositoryDisplayName());

  createRelease({
    tagName,
    targetCommitHash: commitHash,
    title: `${projectName} ${tagName}`,
    isPrerelease: false,
    notes: buildReleaseNotes({
      introduction: `Version ${version}.`,
      tagName,
      previousRelease,
      pullRequests: listPullRequestsMergedSince(previousRelease, commitHash),
    }),
  });
}

/**
 * The branch that carried the version is merged: it is removed so the next
 * release or hotfix can start.
 *
 * @param {string} version
 * @returns {string[]} Names of the deleted branches.
 */
function deleteMergedFlowBranches(version) {
  return Object.values(FlowKind)
    .map((kind) => buildFlowBranchName(kind, version))
    .filter((branchName) => remoteBranchExists(branchName))
    .filter((branchName) => tryDeleteRemoteBranch(branchName));
}

function publishRelease() {
  const commitHash = readRequiredVariable('GITHUB_SHA');
  const version = readProjectVersion(loadProjectConfiguration()).version;
  const tagName = buildVersionTag(version);
  const remoteTags = listRemoteTags();
  const existingTag = remoteTags.find((tag) => tag.name === tagName);

  setOutput('version', version);
  setOutput('tag', tagName);

  /* The version on the production branch was published earlier, from another commit. */
  if (existingTag !== undefined && existingTag.commitHash !== commitHash) {
    setOutput('should-publish', 'false');

    reportWarning(`Rien à publier : la version ${version} existe déjà`, [
      `Le tag « ${tagName} » pointe sur un autre commit : ce push n'apporte pas de nouvelle version et rien n'a été publié.`,
      'C\'est normal lors de la mise en place du pipeline. Dans tous les autres cas, la branche de production ne devrait recevoir que des pull requests « release/x.y.z » ou « hotfix/x.y.z » : vérifiez que ses règles de protection sont actives.',
    ]);
    return;
  }

  /* Checked separately from the tag so a run interrupted halfway can simply be restarted. */
  if (!releaseExists(tagName)) {
    createStableRelease(version, commitHash, remoteTags);
  }

  const deletedBranches = deleteMergedFlowBranches(version);
  const cleanupSentence = deletedBranches.length > 0
    ? `Branche supprimée : \`${deletedBranches.join('`, `')}\`.`
    : 'Aucune branche release ou hotfix à supprimer.';

  setOutput('should-publish', 'true');

  reportSuccess(`Version ${version} publiée`, [
    `Tag \`${tagName}\` et GitHub Release créés sur la branche de production.`,
    cleanupSentence,
    'Les artefacts (images, archives) et le back-merge sont traités par les étapes suivantes du workflow. La mise en production sur le serveur reste manuelle.',
  ]);
}

await runWorkflowCommand(publishRelease);
