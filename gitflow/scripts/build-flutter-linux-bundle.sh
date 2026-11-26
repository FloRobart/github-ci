#!/usr/bin/env bash
#
# Builds the Linux version of a Flutter application ("flutter build linux") in a container
# of the distribution its Debian package targets (see run-in-docker-image.sh): the
# application then links against the system libraries of that distribution, and installs
# on it and on the newer ones. Run as root from the root of the project.
#
# Installs the Linux build tools of the Flutter documentation, then clones Flutter. The
# bundle is written in build/linux/<architecture>/release/bundle/.
#
# Usage: build-flutter-linux-bundle.sh <Flutter version, empty for the latest stable> <options of "flutter pub get"> <options of "flutter build linux">

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

source "${SCRIPTS_DIRECTORY}/common.sh"

readonly FLUTTER_DIRECTORY='/opt/flutter'

# "g++" brings the C++ standard library that clang links against, whatever its version.
readonly BUILD_TOOLS=(ca-certificates curl git unzip xz-utils zip clang cmake ninja-build pkg-config g++ libgtk-3-dev liblzma-dev)

export DEBIAN_FRONTEND=noninteractive

main() {
    local flutter_version="$1"
    local pub_get_options
    local build_options
    read -r -a pub_get_options <<< "$2"
    read -r -a build_options <<< "$3"

    if [ ! -d linux ]; then
        fail 'Plateforme Linux manquante' "Le projet n'a pas de dossier linux/ : activez la plateforme avec « flutter create --platforms=linux . », puis commitez le dossier."
    fi

    install_build_tools
    install_flutter "${flutter_version}"

    flutter pub get "${pub_get_options[@]}"
    flutter build linux "${build_options[@]}"
}

install_build_tools() {
    apt-get update --quiet=2
    apt-get install --yes --quiet=2 --no-install-recommends "${BUILD_TOOLS[@]}" > /dev/null
}

install_flutter() {
    local flutter_version="$1"

    git clone --quiet --depth 1 --branch "${flutter_version:-stable}" https://github.com/flutter/flutter.git "${FLUTTER_DIRECTORY}"
    export PATH="${FLUTTER_DIRECTORY}/bin:${PATH}"

    flutter config --no-analytics > /dev/null
    flutter --version
}

main "$@"
