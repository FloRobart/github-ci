/**
 * Reads and writes the version of a project, whatever its type.
 *
 *   node       package.json (and package-lock.json)
 *   flutter    pubspec.yaml, with its build number ("1.2.3+45")
 *   extension  package.json and the browser extension manifest.json, kept identical
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { isSemanticVersion } from '../core/semantic-version.mjs';
import {
  readJsonVersion,
  readPubspecVersion,
  replaceJsonVersion,
  replacePubspecVersion,
} from '../core/version-files.mjs';
import { readChoiceVariable, readOptionalVariable } from './environment.mjs';
import { readFileAtRevision } from './git-repository.mjs';
import { runCommand } from './process-runner.mjs';
import { WorkflowFailure } from './workflow-report.mjs';

export const ProjectType = Object.freeze({
  NODE: 'node',
  FLUTTER: 'flutter',
  EXTENSION: 'extension',
});

const PACKAGE_FILE = 'package.json';
const PACKAGE_LOCK_FILE = 'package-lock.json';
const PUBSPEC_FILE = 'pubspec.yaml';
const DEFAULT_EXTENSION_MANIFEST_PATH = 'public/manifest.json';

/**
 * @typedef {object} ProjectConfiguration
 * @property {string} type One of the ProjectType values.
 * @property {string} extensionManifestPath Only used by extension projects.
 */

/**
 * @typedef {(filePath: string) => string | null} TextFileReader
 *   Returns the content of a file, or null when the file does not exist.
 */

/* ========================================================================== */
/* Section 1 : Configuration                                                  */
/* ========================================================================== */

/**
 * @returns {ProjectConfiguration} The configuration passed by the workflow.
 */
export function loadProjectConfiguration() {
  return {
    type: readChoiceVariable('PROJECT_TYPE', Object.values(ProjectType)),
    extensionManifestPath: readOptionalVariable('EXTENSION_MANIFEST_PATH', DEFAULT_EXTENSION_MANIFEST_PATH),
  };
}

/**
 * @param {ProjectConfiguration} configuration
 * @returns {string[]} Existing files that hold the version of the project.
 */
export function listVersionFiles(configuration) {
  const filesByProjectType = {
    [ProjectType.NODE]: [PACKAGE_FILE, PACKAGE_LOCK_FILE],
    [ProjectType.FLUTTER]: [PUBSPEC_FILE],
    [ProjectType.EXTENSION]: [PACKAGE_FILE, PACKAGE_LOCK_FILE, configuration.extensionManifestPath],
  };

  return filesByProjectType[configuration.type].filter((filePath) => existsSync(filePath));
}

/* ========================================================================== */
/* Section 2 : Reading                                                        */
/* ========================================================================== */

/**
 * @type {TextFileReader}
 */
function readWorkingTreeFile(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
}

/**
 * @param {string} filePath
 * @param {TextFileReader} readTextFile
 * @returns {string} Content of the file.
 */
function readExistingFile(filePath, readTextFile) {
  const fileContent = readTextFile(filePath);

  if (fileContent === null) {
    throw new WorkflowFailure(`Fichier « ${filePath} » introuvable`, [
      'Ce fichier est nécessaire pour connaître la version du projet.',
      'Vérifiez le paramètre « project-type » transmis au workflow (node, flutter ou extension) et que le fichier existe bien sur la branche concernée.',
    ]);
  }

  return fileContent;
}

/**
 * @param {string} filePath
 * @param {string | null} version
 * @returns {string} The version, guaranteed to be MAJOR.MINOR.PATCH.
 */
function requireSemanticVersion(filePath, version) {
  if (version === null || !isSemanticVersion(version)) {
    throw new WorkflowFailure(`Version illisible dans « ${filePath} »`, [
      `Valeur trouvée : « ${version ?? 'aucune'} ».`,
      'La version doit avoir la forme MAJEUR.MINEUR.CORRECTIF, par exemple « 1.4.2 » (suivie de « +numéro » pour un pubspec.yaml).',
    ]);
  }

  return version;
}

/**
 * @param {string} filePath
 * @param {TextFileReader} readTextFile
 * @returns {string} Version found in a JSON file.
 */
function readJsonFileVersion(filePath, readTextFile) {
  const fileContent = readExistingFile(filePath, readTextFile);

  try {
    return requireSemanticVersion(filePath, readJsonVersion(fileContent));
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    throw new WorkflowFailure(`Fichier « ${filePath} » invalide`, [
      `Son contenu n'est pas du JSON valide : ${error.message}`,
    ]);
  }
}

/**
 * @param {TextFileReader} readTextFile
 * @returns {import('../core/version-files.mjs').ProjectVersion}
 */
function readFlutterVersion(readTextFile) {
  const pubspecVersion = readPubspecVersion(readExistingFile(PUBSPEC_FILE, readTextFile));

  requireSemanticVersion(PUBSPEC_FILE, pubspecVersion?.version ?? null);

  return pubspecVersion;
}

/**
 * @param {ProjectConfiguration} configuration
 * @param {TextFileReader} readTextFile
 * @returns {import('../core/version-files.mjs').ProjectVersion}
 */
function readExtensionVersion(configuration, readTextFile) {
  const packageVersion = readJsonFileVersion(PACKAGE_FILE, readTextFile);
  const manifestVersion = readJsonFileVersion(configuration.extensionManifestPath, readTextFile);

  if (packageVersion !== manifestVersion) {
    throw new WorkflowFailure("Versions incohérentes dans l'extension", [
      `« ${PACKAGE_FILE} » indique ${packageVersion} alors que « ${configuration.extensionManifestPath} » indique ${manifestVersion}.`,
      'Les deux fichiers doivent porter la même version. Alignez-les à la main, puis laissez ensuite le pipeline gérer les montées de version.',
    ]);
  }

  return { version: packageVersion, buildNumber: null };
}

/**
 * @param {ProjectConfiguration} configuration
 * @param {TextFileReader} readTextFile
 * @returns {import('../core/version-files.mjs').ProjectVersion} Version found in the checked out files.
 */
export function readProjectVersion(configuration, readTextFile = readWorkingTreeFile) {
  if (configuration.type === ProjectType.FLUTTER) {
    return readFlutterVersion(readTextFile);
  }

  if (configuration.type === ProjectType.EXTENSION) {
    return readExtensionVersion(configuration, readTextFile);
  }

  return { version: readJsonFileVersion(PACKAGE_FILE, readTextFile), buildNumber: null };
}

/**
 * @param {ProjectConfiguration} configuration
 * @param {string} revision For example "origin/main".
 * @returns {import('../core/version-files.mjs').ProjectVersion} Version of the project at that revision.
 */
export function readProjectVersionAtRevision(configuration, revision) {
  return readProjectVersion(configuration, (filePath) => readFileAtRevision(revision, filePath));
}

/* ========================================================================== */
/* Section 3 : Writing                                                        */
/* ========================================================================== */

/**
 * npm updates package.json and package-lock.json together and keeps their formatting.
 *
 * @param {string} version
 */
function writeNodeVersion(version) {
  runCommand('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts', '--allow-same-version']);
}

/**
 * @param {import('../core/version-files.mjs').ProjectVersion} projectVersion
 */
function writeFlutterVersion(projectVersion) {
  const fileContent = readFileSync(PUBSPEC_FILE, 'utf8');

  writeFileSync(PUBSPEC_FILE, replacePubspecVersion(fileContent, projectVersion));
}

/**
 * @param {ProjectConfiguration} configuration
 * @param {string} version
 */
function writeExtensionVersion(configuration, version) {
  const manifestContent = readFileSync(configuration.extensionManifestPath, 'utf8');

  writeNodeVersion(version);
  writeFileSync(configuration.extensionManifestPath, replaceJsonVersion(manifestContent, version));
}

/**
 * Writes the version in the checked out files, then reads it back to make sure
 * every file really holds it.
 *
 * @param {ProjectConfiguration} configuration
 * @param {import('../core/version-files.mjs').ProjectVersion} projectVersion
 */
export function writeProjectVersion(configuration, projectVersion) {
  if (configuration.type === ProjectType.NODE) {
    writeNodeVersion(projectVersion.version);
  }

  if (configuration.type === ProjectType.FLUTTER) {
    writeFlutterVersion(projectVersion);
  }

  if (configuration.type === ProjectType.EXTENSION) {
    writeExtensionVersion(configuration, projectVersion.version);
  }

  const writtenVersion = readProjectVersion(configuration).version;

  if (writtenVersion !== projectVersion.version) {
    throw new WorkflowFailure("La version n'a pas pu être écrite dans les fichiers du projet", [
      `Version attendue : ${projectVersion.version}. Version relue après écriture : ${writtenVersion}.`,
      'Vérifiez le format de la ligne ou de la clé « version » dans les fichiers du projet.',
    ]);
  }
}
