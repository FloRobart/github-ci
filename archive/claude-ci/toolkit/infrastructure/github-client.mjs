/**
 * GitHub operations used by the commands, done with the GitHub CLI ("gh").
 *
 * The CLI authenticates with the GH_TOKEN environment variable, which the
 * workflows set to the token of the automation GitHub App.
 */

import { readOptionalVariable, readRequiredVariable } from './environment.mjs';
import { runCommand, tryRunCommand } from './process-runner.mjs';

/* Above this number of merged pull requests, the oldest ones are not looked at. */
const MERGED_PULL_REQUESTS_LIMIT = '1000';
const MERGED_PULL_REQUEST_FIELDS = 'number,title,body,url,headRefName,mergeCommit';

const DEFAULT_SERVER_URL = 'https://github.com';

export const MergeRequestOutcome = Object.freeze({
  SCHEDULED: 'scheduled',
  MERGED: 'merged',
  LEFT_OPEN: 'left-open',
});

/**
 * @returns {string} "owner/name" of the repository the workflow runs for.
 */
function readRepositoryName() {
  return readRequiredVariable('GITHUB_REPOSITORY');
}

/**
 * @param {string[]} cliArguments
 * @param {{ standardInput?: string }} options
 * @returns {string} Trimmed output of the GitHub CLI.
 */
function runGitHubCli(cliArguments, options = {}) {
  return runCommand('gh', [...cliArguments, '--repo', readRepositoryName()], options);
}

/* ========================================================================== */
/* Section 1 : Repository                                                     */
/* ========================================================================== */

/**
 * @returns {string} A readable project name deduced from the repository name,
 *   for example "Econoris server" for "FloRobart/Econoris_server".
 */
export function buildRepositoryDisplayName() {
  const nameWithoutOwner = readRepositoryName().split('/')[1];
  const nameWithSpaces = nameWithoutOwner.replaceAll('_', ' ').replaceAll('-', ' ');

  return nameWithSpaces.charAt(0).toUpperCase() + nameWithSpaces.slice(1);
}

/**
 * @param {string} previousTagName
 * @param {string} tagName
 * @returns {string} URL of the page comparing the two tags.
 */
export function buildCompareUrl(previousTagName, tagName) {
  const serverUrl = readOptionalVariable('GITHUB_SERVER_URL', DEFAULT_SERVER_URL);

  return `${serverUrl}/${readRepositoryName()}/compare/${previousTagName}...${tagName}`;
}

/* ========================================================================== */
/* Section 2 : Pull requests                                                  */
/* ========================================================================== */

/**
 * @returns {import('../core/changelog.mjs').MergedPullRequest[]} The most recent merged pull requests.
 */
export function listMergedPullRequests() {
  const output = runGitHubCli([
    'pr', 'list',
    '--state', 'merged',
    '--limit', MERGED_PULL_REQUESTS_LIMIT,
    '--json', MERGED_PULL_REQUEST_FIELDS,
  ]);

  return JSON.parse(output);
}

/**
 * @param {string} headBranch
 * @param {string} baseBranch
 * @returns {string | null} URL of the open pull request between the two branches, null when there is none.
 */
export function findOpenPullRequestUrl(headBranch, baseBranch) {
  const output = runGitHubCli([
    'pr', 'list',
    '--state', 'open',
    '--head', headBranch,
    '--base', baseBranch,
    '--json', 'url',
  ]);

  const openPullRequests = JSON.parse(output);

  return openPullRequests.length > 0 ? openPullRequests[0].url : null;
}

/**
 * @param {object} pullRequest
 * @param {string} pullRequest.headBranch
 * @param {string} pullRequest.baseBranch
 * @param {string} pullRequest.title
 * @param {string} pullRequest.body
 * @returns {string} URL of the created pull request.
 */
export function createPullRequest(pullRequest) {
  return runGitHubCli(
    [
      'pr', 'create',
      '--head', pullRequest.headBranch,
      '--base', pullRequest.baseBranch,
      '--title', pullRequest.title,
      '--body-file', '-',
    ],
    { standardInput: pullRequest.body },
  );
}

/**
 * Asks GitHub to merge the pull request with a merge commit as soon as its
 * required checks pass.
 *
 * @param {string} pullRequestUrl
 * @returns {string} One of the MergeRequestOutcome values.
 */
export function requestMergeWhenChecksPass(pullRequestUrl) {
  const automaticMerge = tryRunCommand('gh', ['pr', 'merge', pullRequestUrl, '--merge', '--auto']);

  if (automaticMerge.succeeded) {
    return MergeRequestOutcome.SCHEDULED;
  }

  /* GitHub refuses auto-merge when nothing is left to wait for: the merge can then be done right away. */
  const immediateMerge = tryRunCommand('gh', ['pr', 'merge', pullRequestUrl, '--merge']);

  return immediateMerge.succeeded ? MergeRequestOutcome.MERGED : MergeRequestOutcome.LEFT_OPEN;
}

/**
 * @param {string} pullRequestUrl
 * @param {string} body
 */
export function commentOnPullRequest(pullRequestUrl, body) {
  runCommand('gh', ['pr', 'comment', pullRequestUrl, '--body-file', '-'], { standardInput: body });
}

/* ========================================================================== */
/* Section 3 : Releases                                                       */
/* ========================================================================== */

/**
 * @param {string} tagName
 * @returns {boolean}
 */
export function releaseExists(tagName) {
  return tryRunCommand('gh', ['release', 'view', tagName, '--repo', readRepositoryName()]).succeeded;
}

/**
 * Creates the GitHub Release and its tag on the given commit.
 *
 * @param {object} release
 * @param {string} release.tagName
 * @param {string} release.targetCommitHash
 * @param {string} release.title
 * @param {string} release.notes
 * @param {boolean} release.isPrerelease
 */
export function createRelease(release) {
  const kindArguments = release.isPrerelease ? ['--prerelease', '--latest=false'] : ['--latest'];

  runGitHubCli(
    [
      'release', 'create', release.tagName,
      '--target', release.targetCommitHash,
      '--title', release.title,
      '--notes-file', '-',
      ...kindArguments,
    ],
    { standardInput: release.notes },
  );
}
