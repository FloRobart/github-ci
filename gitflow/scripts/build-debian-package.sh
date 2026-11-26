#!/usr/bin/env bash
#
# Builds the .deb file of a Debian package, from its tree staged by stage-debian-package.sh.
#
# The staged tree first gets what debhelper writes for the packages of Debian:
#
#   Version         the given version, a release candidate "1.5.0-rc.2" written "1.5.0~rc.2"
#                   (see to_debian_version), or else the one of DEBIAN/control
#   Installed-Size  size of the installed files, shown by apt
#   conffiles       every file of etc/, so that dpkg keeps the changes made by the user
#   md5sums         checksums of the installed files, checked by "dpkg --verify"
#   permissions     readable by everyone, writable by the owner only; DEBIAN/ and the
#                   maintainer scripts executable; every file owned by root in the archive
#
# Then dpkg-deb builds the archive, compressed with xz, and refuses a control file that is
# not valid. The
# fields that dpkg requires are checked before, to name every missing one at once.
#
# Usage: build-debian-package.sh <package folder> <.deb file to write> [version, for example "1.5.0-rc.2"]

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly REQUIRED_CONTROL_FIELDS=(Package Version Architecture Maintainer Description)
readonly MAINTAINER_SCRIPTS=(preinst postinst prerm postrm config)

main() {
    local package_directory="$1"
    local package_file="$2"
    local version="${3:-}"

    local control_file="${package_directory}/${DEBIAN_CONTROL_FILE}"

    if [ -n "${version}" ]; then
        write_control_field "${control_file}" 'Version' "$(to_debian_version "${version}")"
    fi

    check_required_control_fields "${control_file}"
    write_control_field "${control_file}" 'Installed-Size' "$(compute_installed_size "${package_directory}")"
    write_conffiles "${package_directory}"
    write_md5sums "${package_directory}"
    fix_permissions "${package_directory}"

    # xz, as the Debian archive requires: the dpkg-deb of Ubuntu compresses with zstd by
    # default, which the dpkg of older systems cannot read.
    mkdir -p "$(dirname "${package_file}")"
    dpkg-deb --build --root-owner-group -Zxz "${package_directory}" "${package_file}"
}

#==============#
# Control file #
#==============#

check_required_control_fields() {
    local control_file="$1"
    local missing_fields=()

    local field_name
    for field_name in "${REQUIRED_CONTROL_FIELDS[@]}"; do
        if [ -z "$(read_debian_control_field "${field_name}" < "${control_file}")" ]; then
            missing_fields+=("${field_name}")
        fi
    done

    if [ "${#missing_fields[@]}" -eq 0 ]; then
        return
    fi

    fail 'Champs manquants dans DEBIAN/control' "${DEBIAN_CONTROL_FILE} doit aussi avoir les champs : ${missing_fields[*]}. Voir debian/README.md de Github-ci."
}

# Replaces the value of a one-line field, or else adds the field at the end of the file.
write_control_field() {
    local control_file="$1"
    local field_name="$2"
    local field_value="$3"

    if grep --quiet --ignore-case "^${field_name}:" "${control_file}"; then
        sed --in-place --regexp-extended "s/^${field_name}:.*/${field_name}: ${field_value}/I" "${control_file}"
        return
    fi

    # Read back without its trailing blank lines: a blank line would end the paragraph of
    # the package, and dpkg would ignore the field.
    local control_content
    control_content=$(cat "${control_file}")
    printf '%s\n%s: %s\n' "${control_content}" "${field_name}" "${field_value}" > "${control_file}"
}

# In kibibytes, as dpkg expects.
compute_installed_size() {
    local package_directory="$1"

    (cd "${package_directory}" && du --summarize --apparent-size --block-size=1K --exclude=./DEBIAN .) | cut -f 1
}

#=============#
# DEBIAN data #
#=============#

# Debian marks every file of /etc as a configuration file: an upgrade keeps the changes
# made by the user. The files already listed in DEBIAN/conffiles, with or without a flag
# such as "remove-on-upgrade", are kept as they are.
write_conffiles() {
    local package_directory="$1"
    local conffiles_file="${package_directory}/DEBIAN/conffiles"

    if [ ! -d "${package_directory}/etc" ]; then
        return
    fi

    local installed_path
    while IFS= read -r installed_path; do
        if ! is_listed_conffile "${conffiles_file}" "${installed_path}"; then
            echo "${installed_path}" >> "${conffiles_file}"
        fi
    done < <(cd "${package_directory}" && find etc -type f -printf '/%p\n' | sort)
}

is_listed_conffile() {
    local conffiles_file="$1"
    local installed_path="$2"

    [ -f "${conffiles_file}" ] && awk -v path="${installed_path}" '$NF == path { found = 1 } END { exit !found }' "${conffiles_file}"
}

# Written from the staged files, so it always matches them: a DEBIAN/md5sums of the
# repository is replaced.
write_md5sums() {
    local package_directory="$1"

    local checksums
    checksums=$(
        cd "${package_directory}"
        find . -path ./DEBIAN -prune -o -type f -printf '%P\0' | sort --zero-terminated | xargs --null --no-run-if-empty md5sum
    )

    rm -f "${package_directory}/DEBIAN/md5sums"
    if [ -n "${checksums}" ]; then
        echo "${checksums}" > "${package_directory}/DEBIAN/md5sums"
    fi
}

#=============#
# Permissions #
#=============#

# git only keeps the executable bit, and the umask of the machine decides the rest: the
# permissions are set here, the same on every machine. "X" keeps executable what was.
fix_permissions() {
    local package_directory="$1"
    local control_directory="${package_directory}/DEBIAN"

    chmod --recursive u+rwX,go+rX,go-w "${package_directory}"
    chmod 0755 "${control_directory}"
    find "${control_directory}" -type f -exec chmod 0644 {} +

    local script_name
    for script_name in "${MAINTAINER_SCRIPTS[@]}"; do
        if [ -f "${control_directory}/${script_name}" ]; then
            chmod 0755 "${control_directory}/${script_name}"
        fi
    done
}

main "$@"
