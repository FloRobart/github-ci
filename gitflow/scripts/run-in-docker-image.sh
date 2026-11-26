#!/usr/bin/env bash
#
# Runs one of these scripts as root in a new container of a Docker image, for example to
# build or install a Debian package on the distribution it targets rather than on the
# GitHub runner. The container is removed afterwards.
#
#   current folder   mounted on /project, the working folder of the container: a path
#                    relative to the current folder stays valid as an argument
#   these scripts    mounted on /scripts, read-only
#
# The files written in /project belong to root.
#
# Usage: run-in-docker-image.sh <image, for example "debian:12"> <script name> [arguments of the script...]

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPTS_DIRECTORY

main() {
    local docker_image="$1"
    local script_name="$2"
    shift 2

    docker run --rm \
        --volume "${PWD}:/project" \
        --volume "${SCRIPTS_DIRECTORY}:/scripts:ro" \
        --workdir /project \
        "${docker_image}" \
        "/scripts/${script_name}" "$@"
}

main "$@"
