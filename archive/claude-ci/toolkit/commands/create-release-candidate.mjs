/**
 * Publishes a release candidate of the release or hotfix branch the workflow
 * runs on: a "vX.Y.Z-rc.N" tag and a GitHub pre-release.
 *
 * Parameters (environment variables):
 *   GITHUB_REF_NAME          Branch the workflow was started on (set by GitHub).
 *   GITHUB_SHA               Commit to publish (set by GitHub).
 *   PROJECT_TYPE             node, flutter or extension.
 *   EXTENSION_MANIFEST_PATH  Optional path of the manifest.json (extension projects).
 *   RELEASE_NAME             Optional project name used in the release title.
 *   GH_TOKEN                 Token of the automation GitHub App.
 *
 * Outputs: version (for example "1.4.0-rc.2"), tag (for example "v1.4.0-rc.2").
 */

import {
  buildReleaseCandidateTag,
  buildVersionTag,
  findNextReleaseCandidateNumber,
  isReleaseCandidateTagOf,
  parseFlowBranch,
  removeVersionTagPrefix,
} from '../core/flow-branches.mjs';
import { readOptionalVariable, readRequiredVariable } from '../infrastructure/environment.mjs';
import { listRemoteTags } from '../infrastructure/git-repository.mjs';
import { buildRepositoryDisplayName, createRelease } from '../infrastructure/github-client.mjs';
import { loadProjectConfiguration, readProjectVersion } from '../infrastructure/project-version.mjs';
import {
  WorkflowFailure,
  reportInformation,
  reportSuccess,
  runWorkflowCommand,
  setOutput,
} from '../infrastructure/workflow-report.mjs';
import {
  buildReleaseNotes,
  findLatestRelease,
  listPullRequestsMergedSince,
} from '../services/release-history.mjs';

const SHORT_COMMIT_HASH_LENGTH = 7;

/**
 * @param {string} branchName
 * @returns {{ kind: string, version: string }}
 */
function requireFlowBranch(branchName) {
  const flowBranch = parseFlowBranch(branchName);

  if (flowBranch === null) {
    throw new WorkflowFailure('Release candidate impossible depuis cette branche', [
      `Le workflow a été lancé sur « ${branchName} », or une release candidate se publie uniquement depuis une branche « release/x.y.z » ou « hotfix/x.y.z ».`,
      'Relancez le workflow en choisissant la bonne branche dans le menu « Use workflow from ». Si aucune branche de ce type n\'existe, lancez d\'abord « Start release » ou « Start hotfix ».',
    ]);
  }

  return flowBranch;
}

/**
 * @param {string} branchName
 * @param {string} branchVersion
 * @param {{ name: string, commitHash: string }[]} remoteTags
 */
function assertVersionCanBePublished(branchName, branchVersion, remoteTags) {
  const projectVersion = readProjectVersion(loadProjectConfiguration()).version;

  if (projectVersion !== branchVersion) {
    throw new WorkflowFailure('La version du projet ne correspond pas à la branche', [
      `La branche « ${branchName} » annonce la version ${branchVersion}, mais les fichiers du projet indiquent ${projectVersion}.`,
      'Remettez la bonne version dans les fichiers du projet, ou supprimez la branche et relancez « Start release » / « Start hotfix ».',
    ]);
  }

  const stableTagName = buildVersionTag(branchVersion);

  if (remoteTags.some((tag) => tag.name === stableTagName)) {
    throw new WorkflowFailure(`La version ${branchVersion} est déjà publiée`, [
      `Le tag « ${stableTagName} » existe déjà : il n'y a plus de release candidate à produire pour cette version.`,
    ]);
  }
}

/**
 * @param {string} version
 * @param {string} commitHash
 * @param {{ name: string, commitHash: string }[]} remoteTags
 * @returns {string} Name of the tag created for the new candidate.
 */
function publishNewCandidate(version, commitHash, remoteTags) {
  const candidateNumber = findNextReleaseCandidateNumber(remoteTags.map((tag) => tag.name), version);
  const tagName = buildReleaseCandidateTag(version, candidateNumber);
  const previousRelease = findLatestRelease(remoteTags);
  const projectName = readOptionalVariable('RELEASE_NAME', buildRepositoryDisplayName());
  const shortCommitHash = commitHash.slice(0, SHORT_COMMIT_HASH_LENGTH);

  createRelease({
    tagName,
    targetCommitHash: commitHash,
    title: `${projectName} ${tagName}`,
    isPrerelease: true,
    notes: buildReleaseNotes({
      introduction: `Version candidate n°${candidateNumber} de la version ${version}, construite à partir du commit ${shortCommitHash}. Elle sert à tester avant la publication définitive.`,
      tagName,
      previousRelease,
      pullRequests: listPullRequestsMergedSince(previousRelease, commitHash),
    }),
  });

  return tagName;
}

function createReleaseCandidate() {
  const branchName = readRequiredVariable('GITHUB_REF_NAME');
  const commitHash = readRequiredVariable('GITHUB_SHA');
  const { version } = requireFlowBranch(branchName);
  const remoteTags = listRemoteTags();

  assertVersionCanBePublished(branchName, version, remoteTags);

  /* Running the workflow twice on the same commit must not create two candidates. */
  const existingCandidate = remoteTags.find(
    (tag) => isReleaseCandidateTagOf(tag.name, version) && tag.commitHash === commitHash,
  );

  const tagName = existingCandidate?.name ?? publishNewCandidate(version, commitHash, remoteTags);

  setOutput('version', removeVersionTagPrefix(tagName));
  setOutput('tag', tagName);

  if (existingCandidate !== undefined) {
    reportInformation(`Release candidate ${tagName} déjà publiée pour ce commit`, [
      `Aucun nouveau commit sur « ${branchName} » depuis ${tagName} : le tag existant est réutilisé.`,
    ]);
    return;
  }

  reportSuccess(`Release candidate ${tagName} publiée`, [
    `Tag et pre-release GitHub créés à partir de « ${branchName} ».`,
    'Les artefacts de cette version candidate (images, archives) sont publiés par les étapes suivantes du workflow, sans toucher à la version « latest ».',
  ]);
}

await runWorkflowCommand(createReleaseCandidate);
