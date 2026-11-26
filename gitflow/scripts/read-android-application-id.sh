#!/usr/bin/env bash
#
# Prints the applicationId of the Android application of a Flutter project, read in
# android/app/build.gradle.kts or android/app/build.gradle. Run from the root of the project.
#
# F-Droid builds an application in a folder named after its applicationId, and a Flutter
# build depends on its folder: the android job of flutter.yml builds in the same one.
#
# Prints nothing, with a warning, when the applicationId is not written exactly once as a
# plain string (several flavors, a variable): the caller then builds where it stands.
#
# Usage: read-android-application-id.sh

set -o errexit -o nounset -o pipefail

readonly GRADLE_FILES=(android/app/build.gradle.kts android/app/build.gradle)

main() {
    local application_ids
    application_ids=$(read_application_ids)

    if [ -z "${application_ids}" ] || [[ "${application_ids}" == *$'\n'* ]]; then
        warn_about_unknown_application_id
        return
    fi

    echo "${application_ids}"
}

# Prints every distinct applicationId written as a plain string, one per line: either
# 'applicationId = "fr.example.app"' (Kotlin) or 'applicationId "fr.example.app"' (Groovy).
read_application_ids() {
    local gradle_file
    for gradle_file in "${GRADLE_FILES[@]}"; do
        if [ -f "${gradle_file}" ]; then
            sed --quiet --regexp-extended \
                "s/^[[:space:]]*applicationId[[:space:]]*=?[[:space:]]*[\"']([^\"']+)[\"'].*/\1/p" \
                "${gradle_file}"
        fi
    done | sort --unique
}

warn_about_unknown_application_id() {
    echo "::warning title=applicationId introuvable::android/app/build.gradle(.kts) ne donne pas un seul applicationId écrit en toutes lettres (applicationId = \"fr.exemple.app\") : l'APK n'est pas construit dans le dossier qu'utilise F-Droid, qui ne pourra donc pas le reproduire." >&2
}

main "$@"
