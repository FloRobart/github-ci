#!/usr/bin/env bash
#
# Tells what the project is, from its files and the suffix of its name, and prints it as
# "key=value" lines meant for $GITHUB_OUTPUT. Run from the root of the project.
#
# The rules are read from top to bottom, the first one that matches wins:
#
#   name ending with "-database" (database migrations, whatever the other files)
#     a Dockerfile                   →  migrations image
#     no Dockerfile                  →  refused: the migrations are published as a Docker image
#
#   DEBIAN/ folder without DEBIAN/control  →  refused: the control file describes the package
#
#   pubspec.yaml (Flutter, even next to a package.json used for tooling)
#     name ending with "-lib"        →  library, which must have neither Dockerfile nor
#                                       DEBIAN/control
#     name ending with "-app"        →  application (mobile only when there is neither
#                                       Dockerfile nor DEBIAN/control)
#     name ending with "-extension"  →  refused: a browser extension is built with npm
#     a Dockerfile or DEBIAN/control →  application
#     neither of them                →  library (a warning asks for a suffix)
#
#   DEBIAN/control                   →  Debian package, whatever the suffix, even next to a
#                                       package.json used for tooling
#
#   package.json (Node.js)
#     name ending with "-extension"  →  browser extension, the Dockerfile is ignored
#     name ending with "-lib"        →  library, which must not have a Dockerfile
#     a Dockerfile                   →  application: Astro website when "astro" is a
#                                       dependency, Node.js application otherwise
#     name ending with "-app"        →  refused: an application is published as a Docker image
#     any other name                 →  refused: application or library cannot be told apart
#
#   None of these files              →  refused
#
# Printed keys:
#
#   type                "flutter", "nodejs", "astro", "extension", "database" or "debian":
#                       the type CI to run
#   kind                "application", "library", "extension", "migrations" or "package":
#                       what the type CI publishes
#   has-dockerfile      "true" when a Dockerfile exists at the root, "false" otherwise
#   has-debian-control  "true" when DEBIAN/control exists, "false" otherwise: a Flutter
#                       application then also publishes its Debian package
#
# Usage: detect-project.sh <project name, as printed by to-image-name.sh>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly APPLICATION_SUFFIX='-app'
readonly LIBRARY_SUFFIX='-lib'
readonly EXTENSION_SUFFIX='-extension'
readonly DATABASE_SUFFIX='-database'

# The control file of a Debian source package, built with dpkg-buildpackage: not supported.
readonly DEBIAN_SOURCE_CONTROL_FILE='debian/control'

main() {
    local project_name="$1"

    local has_dockerfile='false'
    if [ -f Dockerfile ]; then
        has_dockerfile='true'
    fi

    local has_debian_control='false'
    if [ -f "${DEBIAN_CONTROL_FILE}" ]; then
        has_debian_control='true'
    fi

    detect_type_and_kind "${project_name}" "${has_dockerfile}" "${has_debian_control}"
    echo "has-dockerfile=${has_dockerfile}"
    echo "has-debian-control=${has_debian_control}"
}

detect_type_and_kind() {
    local project_name="$1"
    local has_dockerfile="$2"
    local has_debian_control="$3"

    # A database project may hold a package.json for its tooling: the suffix wins.
    if [[ "${project_name}" == *"${DATABASE_SUFFIX}" ]]; then
        detect_database_project "${project_name}" "${has_dockerfile}"
        return
    fi

    refuse_debian_folder_without_control "${project_name}" "${has_debian_control}"

    if [ -f pubspec.yaml ]; then
        detect_flutter_project "${project_name}" "${has_dockerfile}" "${has_debian_control}"
        return
    fi

    # A Debian package may hold a package.json for its tooling: the control file wins.
    if [ "${has_debian_control}" = 'true' ]; then
        print_type_and_kind 'debian' 'package'
        return
    fi

    if [ -f package.json ]; then
        detect_node_project "${project_name}" "${has_dockerfile}"
        return
    fi

    refuse_unknown_project "${project_name}"
}

#==========#
# Database #
#==========#

detect_database_project() {
    local project_name="$1"
    local has_dockerfile="$2"

    if [ "${has_dockerfile}" = 'false' ]; then
        fail 'Dockerfile manquant' "${project_name} se termine par ${DATABASE_SUFFIX} mais n'a pas de Dockerfile à la racine : les migrations d'une base de données sont publiées en image Docker."
    fi

    print_type_and_kind 'database' 'migrations'
}

#=========#
# Flutter #
#=========#

detect_flutter_project() {
    local project_name="$1"
    local has_dockerfile="$2"
    local has_debian_control="$3"

    case "${project_name}" in
        *"${LIBRARY_SUFFIX}")
            refuse_library_with_dockerfile "${project_name}" "${has_dockerfile}"
            refuse_library_with_debian_control "${project_name}" "${has_debian_control}"
            print_type_and_kind 'flutter' 'library'
            return
            ;;

        *"${APPLICATION_SUFFIX}")
            print_type_and_kind 'flutter' 'application'
            return
            ;;

        *"${EXTENSION_SUFFIX}")
            fail 'Extension Flutter' "${project_name} se termine par ${EXTENSION_SUFFIX} mais a un pubspec.yaml : une extension navigateur se construit avec npm, pas avec Flutter."
            ;;
    esac

    if [ "${has_dockerfile}" = 'true' ] || [ "${has_debian_control}" = 'true' ]; then
        print_type_and_kind 'flutter' 'application'
        return
    fi

    echo "::warning title=Librairie Flutter sans suffixe::${project_name} a un pubspec.yaml, sans Dockerfile, ni ${DEBIAN_CONTROL_FILE}, ni suffixe : il est traité comme une librairie. Renommez le dépôt en *${LIBRARY_SUFFIX} pour le confirmer, ou en *${APPLICATION_SUFFIX} si c'est une application mobile." >&2
    print_type_and_kind 'flutter' 'library'
}

#=========#
# Node.js #
#=========#

detect_node_project() {
    local project_name="$1"
    local has_dockerfile="$2"

    case "${project_name}" in
        *"${EXTENSION_SUFFIX}")
            print_type_and_kind 'extension' 'extension'
            return
            ;;

        *"${LIBRARY_SUFFIX}")
            refuse_library_with_dockerfile "${project_name}" "${has_dockerfile}"
            print_type_and_kind 'nodejs' 'library'
            return
            ;;
    esac

    if [ "${has_dockerfile}" = 'true' ]; then
        print_type_and_kind "$(detect_node_application_type)" 'application'
        return
    fi

    if [[ "${project_name}" == *"${APPLICATION_SUFFIX}" ]]; then
        fail 'Dockerfile manquant' "${project_name} se termine par ${APPLICATION_SUFFIX} mais n'a pas de Dockerfile à la racine : une application Node.js ou Astro est publiée en image Docker."
    fi

    fail 'Type de projet ambigu' "${project_name} a un package.json, mais ni Dockerfile ni suffixe : impossible de savoir si c'est une application ou une librairie. Ajoutez un Dockerfile (application), ou renommez le dépôt en *${LIBRARY_SUFFIX} (librairie npm) ou *${EXTENSION_SUFFIX} (extension navigateur)."
}

# An Astro website and a Node.js API both have a package.json and a Dockerfile: only
# the "astro" dependency tells them apart. A script named "astro" does not count.
detect_node_application_type() {
    if jq --exit-status '(.dependencies // {}) + (.devDependencies // {}) | has("astro")' package.json > /dev/null; then
        echo 'astro'
        return
    fi

    echo 'nodejs'
}

#=========#
# Refusal #
#=========#

refuse_library_with_dockerfile() {
    local project_name="$1"
    local has_dockerfile="$2"

    if [ "${has_dockerfile}" = 'true' ]; then
        fail 'Librairie avec un Dockerfile' "${project_name} se termine par ${LIBRARY_SUFFIX} mais a un Dockerfile : une librairie ne publie pas d'image. Supprimez le Dockerfile, ou renommez le dépôt en *${APPLICATION_SUFFIX}."
    fi
}

refuse_library_with_debian_control() {
    local project_name="$1"
    local has_debian_control="$2"

    if [ "${has_debian_control}" = 'true' ]; then
        fail 'Librairie avec un paquet Debian' "${project_name} se termine par ${LIBRARY_SUFFIX} mais a un ${DEBIAN_CONTROL_FILE} : une librairie Flutter ne publie pas de paquet Debian. Supprimez le dossier DEBIAN, ou renommez le dépôt en *${APPLICATION_SUFFIX}."
    fi
}

# DEBIAN/ alone is most likely a package whose control file was forgotten: without this
# check, the project would silently be detected as something else.
refuse_debian_folder_without_control() {
    local project_name="$1"
    local has_debian_control="$2"

    if [ -d DEBIAN ] && [ "${has_debian_control}" = 'false' ]; then
        fail 'DEBIAN/control manquant' "${project_name} a un dossier DEBIAN sans fichier control : c'est lui qui décrit le paquet Debian (Package, Version, Architecture, Maintainer, Description). Voir debian/README.md de Github-ci."
    fi
}

refuse_unknown_project() {
    local project_name="$1"

    if [ -f "${DEBIAN_SOURCE_CONTROL_FILE}" ]; then
        fail 'Paquet source Debian' "${project_name} a un ${DEBIAN_SOURCE_CONTROL_FILE} : c'est un paquet source Debian, construit avec dpkg-buildpackage, que la CI ne sait pas construire. Elle construit les paquets décrits par un ${DEBIAN_CONTROL_FILE} en majuscules, à côté de l'arborescence installée (usr/, etc/…). Voir debian/README.md de Github-ci."
    fi

    fail 'Projet non reconnu' "Ni pubspec.yaml (Flutter), ni ${DEBIAN_CONTROL_FILE} (paquet Debian), ni package.json (Node.js) à la racine de ${project_name}, et pas de suffixe ${DATABASE_SUFFIX} : la CI ne sait pas quel type de projet construire."
}

#========#
# Output #
#========#

print_type_and_kind() {
    local type="$1"
    local kind="$2"

    echo "type=${type}"
    echo "kind=${kind}"
}

main "$@"
