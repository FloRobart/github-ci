#!/usr/bin/env bash
#
# Copies the tree of a Debian package into a new folder, from which build-debian-package.sh
# builds the .deb file. Run from the root of the project.
#
# The root of the project is the tree of the package, as installed on the system. Only these
# folders are copied, so that the other files of the repository (README, .github…) stay out
# of the package:
#
#   DEBIAN/                    control file, maintainer scripts (postinst…), conffiles…
#   etc/ opt/ srv/ usr/ var/   files installed on the system
#
# bin/, sbin/ and lib*/ are refused: on Debian and Ubuntu, they are links to the folders of
# usr/ ("merged /usr"), where a package must install its files. A Flutter project is not
# checked: its lib/ holds the Dart sources, and its package gets the built application.
#
# Usage: stage-debian-package.sh <package folder, created when missing>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly INSTALLED_DIRECTORIES=(etc opt srv usr var)
readonly MERGED_USR_DIRECTORIES=(bin sbin lib lib32 lib64 libx32)

main() {
    local package_directory="$1"

    if [ ! -f "${DEBIAN_CONTROL_FILE}" ]; then
        fail 'DEBIAN/control manquant' "Le projet n'a pas de ${DEBIAN_CONTROL_FILE} à sa racine : c'est lui qui décrit le paquet Debian."
    fi

    if [ ! -f pubspec.yaml ]; then
        refuse_merged_usr_directories
    fi

    mkdir -p "${package_directory}"
    cp --archive DEBIAN "${package_directory}/"

    local installed_directory
    for installed_directory in "${INSTALLED_DIRECTORIES[@]}"; do
        if [ -d "${installed_directory}" ]; then
            cp --archive "${installed_directory}" "${package_directory}/"
        fi
    done
}

refuse_merged_usr_directories() {
    local merged_usr_directory
    for merged_usr_directory in "${MERGED_USR_DIRECTORIES[@]}"; do
        if [ -e "${merged_usr_directory}" ]; then
            fail "Dossier ${merged_usr_directory}/ refusé" "Le paquet installe des fichiers dans /${merged_usr_directory}, qui n'est plus qu'un lien vers /usr/${merged_usr_directory} sur Debian et Ubuntu (« merged /usr ») : déplacez ${merged_usr_directory}/ dans usr/${merged_usr_directory}/."
        fi
    done
}

main "$@"
