#!/usr/bin/env bash
#
# Installs a .deb file then removes it, to prove that it works on a clean system: run as
# root in a fresh container of the targeted distribution (see run-in-docker-image.sh), never
# on a machine that matters.
#
#   1. apt installs the package and its Depends, and runs preinst and postinst
#   2. every executable of the package finds its shared libraries: a library brought by
#      nothing means that a package is missing from Depends
#   3. apt purges the package, and runs prerm and postrm
#
# Usage: install-and-remove-debian-package.sh <.deb file>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

# No question from debconf: the defaults of the package are used.
export DEBIAN_FRONTEND=noninteractive

main() {
    local package_file="$1"

    local package_name
    package_name=$(dpkg-deb --field "${package_file}" Package)

    install_package "${package_file}"
    check_shared_libraries "${package_name}"
    remove_package "${package_name}"

    echo "${package_name} s'installe, trouve ses bibliothèques et se désinstalle."
}

# The path starts with "/" or "./", so apt reads the file instead of looking for a package.
install_package() {
    local package_file="$1"

    apt-get update --quiet=2

    if ! apt-get install --yes --quiet=2 --option Dpkg::Use-Pty=0 "$(realpath "${package_file}")"; then
        fail 'Installation impossible' "apt n'installe pas le paquet sur ce système : une dépendance de Depends n'existe pas, ou un script preinst ou postinst échoue. Voir le log ci-dessus."
    fi
}

remove_package() {
    local package_name="$1"

    if ! apt-get purge --yes --quiet=2 --option Dpkg::Use-Pty=0 "${package_name}"; then
        fail 'Désinstallation impossible' "apt ne désinstalle pas le paquet : un script prerm ou postrm échoue. Voir le log ci-dessus."
    fi
}

#==================#
# Shared libraries #
#==================#

check_shared_libraries() {
    local package_name="$1"

    local missing_libraries
    missing_libraries=$(
        dpkg --listfiles "${package_name}" | while IFS= read -r installed_path; do
            if is_executable_program "${installed_path}"; then
                list_missing_libraries "${installed_path}"
            fi
        done
    )

    if [ -z "${missing_libraries}" ]; then
        return
    fi

    echo "${missing_libraries}" >&2
    fail 'Bibliothèques manquantes' "Des exécutables du paquet ne trouvent pas leurs bibliothèques une fois installé seul (liste ci-dessus) : ajoutez à Depends, dans DEBIAN/control, les paquets qui les fournissent (« apt-file search <bibliothèque> » les trouve)."
}

# A program, not a shared library: a library of the package may only be found through
# the program that loads it (RUNPATH of a Flutter application, for example).
is_executable_program() {
    local file_path="$1"

    [ -f "${file_path}" ] \
        && [ ! -L "${file_path}" ] \
        && [ -x "${file_path}" ] \
        && [[ "${file_path}" != *.so && "${file_path}" != *.so.* ]] \
        && [ "$(head --bytes=4 "${file_path}")" = $'\x7fELF' ]
}

# Prints "<program> : <library> => not found" for every library that ldd cannot resolve,
# or that is too old ("version `GLIBC_2.38' not found").
list_missing_libraries() {
    local program_path="$1"

    ldd "${program_path}" 2>&1 | grep 'not found' | sed "s|^[[:space:]]*|${program_path} : |" || true
}

main "$@"
