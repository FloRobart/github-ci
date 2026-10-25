#!/usr/bin/env bash
#
# Tells what the project is, from its files and the suffix of its name, and prints it as
# "key=value" lines meant for $GITHUB_OUTPUT. Run from the root of the project.
#
# The rules are read from top to bottom, the first one that matches wins:
#
#   pubspec.yaml (Flutter, even next to a package.json used for tooling)
#     name ending with "-lib"        →  library, which must not have a Dockerfile
#     name ending with "-app"        →  application (mobile only when there is no Dockerfile)
#     name ending with "-extension"  →  refused: a browser extension is built with npm
#     a Dockerfile                   →  application
#     no Dockerfile                  →  library (a warning asks for a suffix)
#
#   package.json (Node.js)
#     name ending with "-extension"  →  browser extension, the Dockerfile is ignored
#     name ending with "-lib"        →  library, which must not have a Dockerfile
#     a Dockerfile                   →  application: Astro website when "astro" is a
#                                       dependency, Node.js application otherwise
#     name ending with "-app"        →  refused: an application is published as a Docker image
#     any other name                 →  refused: application or library cannot be told apart
#
#   Neither file                     →  refused
#
# Printed keys:
#
#   type            "flutter", "nodejs", "astro" or "extension": the type CI to run
#   kind            "application", "library" or "extension": what the type CI publishes
#   has-dockerfile  "true" when a Dockerfile exists at the root, "false" otherwise
#
# Usage: detect-project.sh <project name, as printed by to-image-name.sh>

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly APPLICATION_SUFFIX='-app'
readonly LIBRARY_SUFFIX='-lib'
readonly EXTENSION_SUFFIX='-extension'

main() {
    local project_name="$1"

    local has_dockerfile='false'
    if [ -f Dockerfile ]; then
        has_dockerfile='true'
    fi

    detect_type_and_kind "${project_name}" "${has_dockerfile}"
    echo "has-dockerfile=${has_dockerfile}"
}

detect_type_and_kind() {
    local project_name="$1"
    local has_dockerfile="$2"

    if [ -f pubspec.yaml ]; then
        detect_flutter_project "${project_name}" "${has_dockerfile}"
        return
    fi

    if [ -f package.json ]; then
        detect_node_project "${project_name}" "${has_dockerfile}"
        return
    fi

    fail 'Projet non reconnu' "Ni pubspec.yaml (Flutter) ni package.json (Node.js) à la racine de ${project_name} : la CI ne sait pas quel type de projet construire."
}

#=========#
# Flutter #
#=========#

detect_flutter_project() {
    local project_name="$1"
    local has_dockerfile="$2"

    case "${project_name}" in
        *"${LIBRARY_SUFFIX}")
            refuse_library_with_dockerfile "${project_name}" "${has_dockerfile}"
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

    if [ "${has_dockerfile}" = 'true' ]; then
        print_type_and_kind 'flutter' 'application'
        return
    fi

    echo "::warning title=Librairie Flutter sans suffixe::${project_name} a un pubspec.yaml, sans Dockerfile ni suffixe : il est traité comme une librairie. Renommez le dépôt en *${LIBRARY_SUFFIX} pour le confirmer, ou en *${APPLICATION_SUFFIX} si c'est une application mobile." >&2
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
# Helpers #
#=========#

refuse_library_with_dockerfile() {
    local project_name="$1"
    local has_dockerfile="$2"

    if [ "${has_dockerfile}" = 'true' ]; then
        fail 'Librairie avec un Dockerfile' "${project_name} se termine par ${LIBRARY_SUFFIX} mais a un Dockerfile : une librairie ne publie pas d'image. Supprimez le Dockerfile, ou renommez le dépôt en *${APPLICATION_SUFFIX}."
    fi
}

print_type_and_kind() {
    local type="$1"
    local kind="$2"

    echo "type=${type}"
    echo "kind=${kind}"
}

main "$@"
