/**
 * Reads and rewrites the version inside the content of project files.
 *
 * These functions only work on text: reading and writing the files themselves
 * is done by the infrastructure layer.
 */

/* Matches the top-level "version" key without touching keys like "manifest_version". */
const JSON_VERSION_PROPERTY_PATTERN = /("version"\s*:\s*")[^"]*(")/;

/* Matches "version: 1.2.3" or "version: 1.2.3+45" on its own line of a pubspec.yaml. */
const PUBSPEC_VERSION_LINE_PATTERN = /^version:[ \t]*(?<version>\d+\.\d+\.\d+)(?:\+(?<buildNumber>\d+))?[ \t]*\r?$/m;

const WINDOWS_LINE_ENDING_CHARACTER = '\r';

/**
 * @typedef {object} ProjectVersion
 * @property {string} version MAJOR.MINOR.PATCH
 * @property {number | null} buildNumber Flutter build number, null for projects without one.
 */

/**
 * @param {string} fileContent Content of a JSON file (package.json, manifest.json).
 * @returns {string | null} The "version" value, null when it is missing.
 */
export function readJsonVersion(fileContent) {
  const version = JSON.parse(fileContent).version;

  return typeof version === 'string' ? version : null;
}

/**
 * Replaces the version in place so the formatting of the file is kept as is.
 *
 * @param {string} fileContent
 * @param {string} version
 * @returns {string} The updated content.
 */
export function replaceJsonVersion(fileContent, version) {
  /* A function is used because "$1" followed by a version starting with a digit would be misread. */
  return fileContent.replace(
    JSON_VERSION_PROPERTY_PATTERN,
    (_matchedText, textBeforeVersion, textAfterVersion) => `${textBeforeVersion}${version}${textAfterVersion}`,
  );
}

/**
 * @param {string} fileContent Content of a pubspec.yaml file.
 * @returns {ProjectVersion | null} null when no readable "version:" line is found.
 */
export function readPubspecVersion(fileContent) {
  const match = PUBSPEC_VERSION_LINE_PATTERN.exec(fileContent);

  if (match === null) {
    return null;
  }

  const { version, buildNumber } = match.groups;

  return {
    version,
    buildNumber: buildNumber === undefined ? null : Number(buildNumber),
  };
}

/**
 * @param {ProjectVersion} projectVersion
 * @returns {string} "1.2.3+45", or "1.2.3" when there is no build number.
 */
export function formatPubspecVersion(projectVersion) {
  if (projectVersion.buildNumber === null) {
    return projectVersion.version;
  }

  return `${projectVersion.version}+${projectVersion.buildNumber}`;
}

/**
 * @param {string} fileContent
 * @param {ProjectVersion} projectVersion
 * @returns {string} The updated content.
 */
export function replacePubspecVersion(fileContent, projectVersion) {
  return fileContent.replace(PUBSPEC_VERSION_LINE_PATTERN, (matchedLine) => {
    const lineEnding = matchedLine.endsWith(WINDOWS_LINE_ENDING_CHARACTER) ? WINDOWS_LINE_ENDING_CHARACTER : '';

    return `version: ${formatPubspecVersion(projectVersion)}${lineEnding}`;
  });
}

/**
 * Stores require a build number that grows with every published build.
 *
 * @param {number | null} productionBuildNumber Build number currently in production.
 * @returns {number | null} The next build number, null for projects without one.
 */
export function computeNextBuildNumber(productionBuildNumber) {
  if (productionBuildNumber === null) {
    return null;
  }

  return productionBuildNumber + 1;
}
