/**
 * Semantic version helpers.
 *
 * Only stable versions (MAJOR.MINOR.PATCH) are handled here. Pre-release
 * identifiers such as "-rc.1" only exist in tag names and are built by the
 * flow-branches module.
 */

export const BumpLevel = Object.freeze({
  MAJOR: 'major',
  MINOR: 'minor',
  PATCH: 'patch',
});

/* Ordered from the smallest to the biggest impact on the version. */
const BUMP_LEVELS_BY_INCREASING_IMPACT = [BumpLevel.PATCH, BumpLevel.MINOR, BumpLevel.MAJOR];

const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * @param {string} text
 * @returns {boolean} true when the text is exactly MAJOR.MINOR.PATCH.
 */
export function isSemanticVersion(text) {
  return SEMANTIC_VERSION_PATTERN.test(text);
}

/**
 * @param {string} version
 * @returns {number[]} [major, minor, patch]
 */
function splitVersionNumbers(version) {
  const match = SEMANTIC_VERSION_PATTERN.exec(version);

  if (match === null) {
    throw new Error(`"${version}" is not a valid semantic version (expected MAJOR.MINOR.PATCH).`);
  }

  return match.slice(1).map(Number);
}

/**
 * @param {string} firstVersion
 * @param {string} secondVersion
 * @returns {number} 1 when the first version is higher, -1 when it is lower, 0 when both are equal.
 */
export function compareSemanticVersions(firstVersion, secondVersion) {
  const firstNumbers = splitVersionNumbers(firstVersion);
  const secondNumbers = splitVersionNumbers(secondVersion);

  for (let index = 0; index < firstNumbers.length; index += 1) {
    const difference = firstNumbers[index] - secondNumbers[index];

    if (difference !== 0) {
      return Math.sign(difference);
    }
  }

  return 0;
}

/**
 * @param {string} version
 * @param {string} bumpLevel One of the BumpLevel values.
 * @returns {string} The next version for the given bump level.
 */
export function incrementSemanticVersion(version, bumpLevel) {
  const [major, minor, patch] = splitVersionNumbers(version);

  if (bumpLevel === BumpLevel.MAJOR) {
    return `${major + 1}.0.0`;
  }

  if (bumpLevel === BumpLevel.MINOR) {
    return `${major}.${minor + 1}.0`;
  }

  if (bumpLevel === BumpLevel.PATCH) {
    return `${major}.${minor}.${patch + 1}`;
  }

  throw new Error(`Unknown bump level "${bumpLevel}".`);
}

/**
 * @param {string[]} versions
 * @returns {string | null} The highest version, or null when the list is empty.
 */
export function findHighestSemanticVersion(versions) {
  if (versions.length === 0) {
    return null;
  }

  return versions.reduce((highestVersion, candidateVersion) => {
    const isCandidateHigher = compareSemanticVersions(candidateVersion, highestVersion) > 0;

    return isCandidateHigher ? candidateVersion : highestVersion;
  });
}

/**
 * @param {string[]} bumpLevels
 * @returns {string} The level with the biggest impact. An empty list gives a patch.
 */
export function findHighestBumpLevel(bumpLevels) {
  const impacts = bumpLevels.map((bumpLevel) => BUMP_LEVELS_BY_INCREASING_IMPACT.indexOf(bumpLevel));
  const highestImpact = Math.max(0, ...impacts);

  return BUMP_LEVELS_BY_INCREASING_IMPACT[highestImpact];
}
