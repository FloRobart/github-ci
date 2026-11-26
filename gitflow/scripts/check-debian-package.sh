#!/usr/bin/env bash
#
# Checks the files of a .deb file, then prints a Markdown report for $GITHUB_STEP_SUMMARY.
# Needs dpkg-deb, desktop-file-validate (package desktop-file-utils) and lintian.
#
#   .desktop files   checked by desktop-file-validate: an error stops the run, since the
#                    desktop would not show the application in its menu
#   lintian          only reported: it checks the rules of the Debian archive, and some of
#                    them do not apply to a package published on GitHub (no copyright file,
#                    files in /opt…)
#
# Usage: check-debian-package.sh <.deb file>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

main() {
    local package_file="$1"

    check_desktop_files "${package_file}"
    print_report "${package_file}"
}

check_desktop_files() {
    local package_file="$1"

    local extracted_directory
    extracted_directory=$(mktemp -d)
    dpkg-deb --extract "${package_file}" "${extracted_directory}"

    local invalid_desktop_files=''
    local desktop_file_path
    while IFS= read -r desktop_file_path; do
        if ! desktop-file-validate "${desktop_file_path}" >&2; then
            invalid_desktop_files+=" ${desktop_file_path#"${extracted_directory}"}"
        fi
    done < <(find "${extracted_directory}/usr/share/applications" -name '*.desktop' 2> /dev/null)

    rm -rf "${extracted_directory}"

    if [ -n "${invalid_desktop_files}" ]; then
        fail 'Fichier .desktop invalide' "desktop-file-validate refuse${invalid_desktop_files} : voir ses messages ci-dessus."
    fi
}

#========#
# Report #
#========#

print_report() {
    local package_file="$1"

    local lintian_output
    lintian_output=$(lintian --fail-on none "${package_file}" 2>&1)

    local lintian_remark_count=0
    if [ -n "${lintian_output}" ]; then
        lintian_remark_count=$(wc --lines <<< "${lintian_output}")
    fi

    echo '### 📦 Paquet Debian'
    echo
    echo "\`$(basename "${package_file}")\` : $(describe_package "${package_file}")."
    echo

    if [ "${lintian_remark_count}" -eq 0 ]; then
        echo 'lintian : aucune remarque.'
        return
    fi

    echo '<details>'
    echo "<summary>lintian : ${lintian_remark_count} remarque(s), qui n'empêchent pas l'installation</summary>"
    echo
    echo '```text'
    echo "${lintian_output}"
    echo '```'
    echo
    echo '</details>'
}

# For example "apt-auto-update 1.5.0~rc.2, all, 12 Kio installés".
describe_package() {
    local package_file="$1"

    # The ${...} are fields read by dpkg-deb, not shell variables:
    # shellcheck disable=SC2016
    dpkg-deb --show --showformat='${Package} ${Version}, ${Architecture}, ${Installed-Size} Kio installés' "${package_file}"
}

main "$@"
