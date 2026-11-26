#!/usr/bin/env bash
#
# Adds the Linux bundle of a Flutter application ("flutter build linux") to the tree of its
# Debian package, staged by stage-debian-package.sh:
#
#   /opt/<package>/            the bundle: the executable, lib/ and data/
#   /usr/bin/<package>         link to the executable, the command of the .desktop file
#
# <package> is the "Package:" field of DEBIAN/control. The project writes only DEBIAN/control
# and its .desktop file, in usr/share/applications/: both are checked here, so that a
# mistake stops the build with a clear message.
#
# Usage: add-flutter-bundle-to-debian-package.sh <package folder> <bundle folder, for example "build/linux/x64/release/bundle">

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly DESKTOP_FILES_DIRECTORY='usr/share/applications'

main() {
    local package_directory="$1"
    local bundle_directory="$2"

    local control_file="${package_directory}/${DEBIAN_CONTROL_FILE}"
    local package_name
    package_name=$(read_debian_control_field 'Package' < "${control_file}")

    if [ -z "${package_name}" ]; then
        fail 'Champ Package manquant' "${DEBIAN_CONTROL_FILE} n'a pas de champ « Package: » : il nomme le paquet, et le dossier /opt/<paquet> de l'application."
    fi

    check_architecture "${control_file}"
    check_desktop_file "${package_directory}" "${package_name}"

    local executable_name
    executable_name=$(find_bundle_executable "${bundle_directory}")

    refuse_generated_path "${package_directory}" "opt/${package_name}"
    refuse_generated_path "${package_directory}" "usr/bin/${package_name}"

    mkdir -p "${package_directory}/opt" "${package_directory}/usr/bin"
    cp --archive "${bundle_directory}" "${package_directory}/opt/${package_name}"
    ln --symbolic "/opt/${package_name}/${executable_name}" "${package_directory}/usr/bin/${package_name}"
}

# The paths written here must not come from the repository too.
refuse_generated_path() {
    local package_directory="$1"
    local generated_path="$2"

    if [ -e "${package_directory}/${generated_path}" ] || [ -L "${package_directory}/${generated_path}" ]; then
        fail "${generated_path} refusé" "Le dépôt a déjà ${generated_path} : c'est la CI qui l'écrit, depuis l'application Flutter construite. Supprimez-le du dépôt."
    fi
}

# The bundle is built for the architecture of the machine that builds it: the package must
# declare the same one, or dpkg would install it where it cannot run.
check_architecture() {
    local control_file="$1"

    local declared_architecture
    declared_architecture=$(read_debian_control_field 'Architecture' < "${control_file}")

    local built_architecture
    built_architecture=$(dpkg --print-architecture)

    if [ "${declared_architecture}" != "${built_architecture}" ]; then
        fail 'Architecture incorrecte' "${DEBIAN_CONTROL_FILE} déclare « Architecture: ${declared_architecture:-absente} », mais l'application Flutter est construite pour ${built_architecture} : écrivez « Architecture: ${built_architecture} »."
    fi
}

check_desktop_file() {
    local package_directory="$1"
    local package_name="$2"

    if compgen -G "${package_directory}/${DESKTOP_FILES_DIRECTORY}/*.desktop" > /dev/null; then
        return
    fi

    fail 'Fichier .desktop manquant' "Le dépôt n'a pas de fichier ${DESKTOP_FILES_DIRECTORY}/*.desktop : sans lui, l'application n'apparaît pas dans le menu. Ajoutez ${DESKTOP_FILES_DIRECTORY}/${package_name}.desktop, avec « Exec=${package_name} »."
}

# Prints the name of the executable of the bundle: the only executable file at its top,
# next to lib/ and data/.
find_bundle_executable() {
    local bundle_directory="$1"

    if [ ! -d "${bundle_directory}" ]; then
        fail 'Application Linux introuvable' "${bundle_directory} n'existe pas : « flutter build linux » n'a pas construit l'application."
    fi

    local executable_names
    executable_names=$(find "${bundle_directory}" -mindepth 1 -maxdepth 1 -type f -perm -u+x -printf '%f\n')

    if [ -z "${executable_names}" ] || [[ "${executable_names}" == *$'\n'* ]]; then
        fail 'Exécutable introuvable' "${bundle_directory} doit contenir un seul fichier exécutable, l'application, et il en contient : ${executable_names:-aucun}."
    fi

    echo "${executable_names}"
}

main "$@"
