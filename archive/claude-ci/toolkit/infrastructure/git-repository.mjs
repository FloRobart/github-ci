/**
 * Git operations used by the commands.
 *
 * The repository is expected to be fully checked out (fetch-depth: 0) and git
 * to be authenticated before the functions that talk to the remote are called.
 */

import { runCommand, splitLines, tryRunCommand } from './process-runner.mjs';

const REMOTE_NAME = 'origin';
const BRANCH_REFERENCE_PREFIX = 'refs/heads/';
const TAG_REFERENCE_PREFIX = 'refs/tags/';

/* Suffix git adds to show the commit an annotated tag points to. */
const PEELED_TAG_SUFFIX = '^{}';

const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_NOT_ANCESTOR = 1;

/**
 * @param {string[]} gitArguments
 * @returns {string} Trimmed output of the git command.
 */
function runGit(gitArguments) {
  return runCommand('git', gitArguments);
}

/* ========================================================================== */
/* Section 1 : Reading the remote                                             */
/* ========================================================================== */

/**
 * @param {string} branchName
 * @returns {string} The revision of the branch as known from the remote, for example "origin/main".
 */
export function buildRemoteRevision(branchName) {
  return `${REMOTE_NAME}/${branchName}`;
}

/**
 * @param {string} branchPrefix For example "release/".
 * @returns {string[]} Names of the remote branches starting with the prefix.
 */
export function listRemoteBranchNames(branchPrefix) {
  const output = runGit(['ls-remote', '--heads', REMOTE_NAME, `${BRANCH_REFERENCE_PREFIX}${branchPrefix}*`]);

  return splitLines(output).map((line) => line.split('\t')[1].slice(BRANCH_REFERENCE_PREFIX.length));
}

/**
 * @param {string} branchName
 * @returns {boolean}
 */
export function remoteBranchExists(branchName) {
  const output = runGit(['ls-remote', '--heads', REMOTE_NAME, `${BRANCH_REFERENCE_PREFIX}${branchName}`]);

  return output !== '';
}

/**
 * @returns {{ name: string, commitHash: string }[]} Every tag of the remote with the commit it points to.
 */
export function listRemoteTags() {
  const output = runGit(['ls-remote', '--tags', REMOTE_NAME]);
  const commitHashByTagName = new Map();

  for (const line of splitLines(output)) {
    const [objectHash, referenceName] = line.split('\t');
    const isPeeledReference = referenceName.endsWith(PEELED_TAG_SUFFIX);
    const tagNameEnd = isPeeledReference ? -PEELED_TAG_SUFFIX.length : undefined;
    const tagName = referenceName.slice(TAG_REFERENCE_PREFIX.length, tagNameEnd);

    /* For an annotated tag, only the peeled line gives the commit: it wins over the plain one. */
    if (isPeeledReference || !commitHashByTagName.has(tagName)) {
      commitHashByTagName.set(tagName, objectHash);
    }
  }

  return [...commitHashByTagName].map(([name, commitHash]) => ({ name, commitHash }));
}

/* ========================================================================== */
/* Section 2 : Reading the history                                            */
/* ========================================================================== */

/**
 * @param {string} revision
 * @returns {string} Full hash of the commit the revision points to.
 */
function resolveCommitHash(revision) {
  return runGit(['rev-parse', '--verify', `${revision}^{commit}`]);
}

/**
 * @param {string} ancestorRevision
 * @param {string} descendantRevision
 * @returns {boolean} true when every commit of the first revision is contained in the second one.
 */
export function isAncestor(ancestorRevision, descendantRevision) {
  const result = tryRunCommand('git', ['merge-base', '--is-ancestor', ancestorRevision, descendantRevision]);

  if (result.exitCode === EXIT_CODE_SUCCESS) {
    return true;
  }

  if (result.exitCode === EXIT_CODE_NOT_ANCESTOR) {
    return false;
  }

  throw new Error(`Impossible de comparer « ${ancestorRevision} » et « ${descendantRevision} » : ${result.errorOutput}`);
}

/**
 * @param {string} revisionRange A revision ("origin/main") or a range ("abc123..origin/develop").
 * @returns {string[]} Hashes of the commits selected by the range.
 */
export function listCommitHashes(revisionRange) {
  return splitLines(runGit(['rev-list', revisionRange]));
}

/**
 * @param {string} revision
 * @param {string} filePath Path from the root of the repository.
 * @returns {string | null} Content of the file at that revision, null when it does not exist there.
 */
export function readFileAtRevision(revision, filePath) {
  const result = tryRunCommand('git', ['show', `${revision}:${filePath}`]);

  return result.succeeded ? result.output : null;
}

/* ========================================================================== */
/* Section 3 : Changing the local repository                                  */
/* ========================================================================== */

/**
 * Creates the local branch (or moves it) on the given revision and switches to it.
 *
 * @param {string} branchName
 * @param {string} startRevision
 */
export function checkoutBranchAtRevision(branchName, startRevision) {
  runGit(['checkout', '-B', branchName, startRevision]);
}

/**
 * @param {string[]} filePaths Only these files are committed, whatever else changed.
 * @param {string} message
 * @returns {boolean} false when the files have no change to commit.
 */
export function commitFiles(filePaths, message) {
  runGit(['add', '--', ...filePaths]);

  /* "git diff --quiet" succeeds when nothing is staged. */
  const hasNothingToCommit = tryRunCommand('git', ['diff', '--cached', '--quiet']).succeeded;

  if (hasNothingToCommit) {
    return false;
  }

  runGit(['commit', '--message', message]);

  return true;
}

/**
 * @param {string} revision
 * @param {string} message Message of the merge commit.
 * @returns {boolean} false when the merge has conflicts; the merge is then cancelled.
 */
export function tryMergeRevision(revision, message) {
  const mergeResult = tryRunCommand('git', ['merge', '--no-ff', '--no-edit', '--message', message, revision]);

  if (!mergeResult.succeeded) {
    tryRunCommand('git', ['merge', '--abort']);
  }

  return mergeResult.succeeded;
}

/**
 * Drops every local commit and change of the current branch.
 *
 * @param {string} revision
 */
export function resetCurrentBranchTo(revision) {
  runGit(['reset', '--hard', revision]);
}

/* ========================================================================== */
/* Section 4 : Changing the remote                                            */
/* ========================================================================== */

/**
 * @param {string} branchName Remote branch that receives the current local commit.
 */
export function pushCurrentCommitToBranch(branchName) {
  runGit(['push', REMOTE_NAME, `HEAD:${BRANCH_REFERENCE_PREFIX}${branchName}`]);
}

/**
 * @param {string} branchName
 * @param {string} revision Commit the new remote branch starts from.
 */
export function createRemoteBranch(branchName, revision) {
  runGit(['push', REMOTE_NAME, `${resolveCommitHash(revision)}:${BRANCH_REFERENCE_PREFIX}${branchName}`]);
}

/**
 * @param {string} branchName
 * @returns {boolean} false when the remote refused to delete the branch.
 */
export function tryDeleteRemoteBranch(branchName) {
  const result = tryRunCommand('git', ['push', REMOTE_NAME, '--delete', `${BRANCH_REFERENCE_PREFIX}${branchName}`]);

  return result.succeeded;
}
