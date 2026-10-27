#!/usr/bin/env bash
#
# Tests of the gitflow scripts, run on throwaway git repositories.
# No network, no GitHub: only the scripts that work with git alone are tested, a local
# bare repository standing for GitHub. Needs jq and npm.
#
# Usage: gitflow/tests/run-tests.sh

set -o errexit -o nounset -o pipefail

SCRIPTS_DIRECTORY="$(cd "$(dirname "$0")/../scripts" && pwd)"
readonly SCRIPTS_DIRECTORY

WORKING_DIRECTORY="$(mktemp -d)"
readonly WORKING_DIRECTORY
trap 'rm -rf "${WORKING_DIRECTORY}"' EXIT

export PATH="${SCRIPTS_DIRECTORY}:${PATH}"
export GIT_AUTHOR_NAME='Test' GIT_AUTHOR_EMAIL='test@example.com'
export GIT_COMMITTER_NAME='Test' GIT_COMMITTER_EMAIL='test@example.com'

failed_test_count=0

#=========#
# Helpers #
#=========#

assert_equals() {
    local description="$1"
    local expected="$2"
    local actual="$3"

    if [ "${expected}" = "${actual}" ]; then
        echo "  ✔ ${description}"
        return
    fi

    echo "  ✘ ${description}"
    echo "      attendu : ${expected}"
    echo "      obtenu  : ${actual}"
    failed_test_count=$((failed_test_count + 1))
}

assert_succeeds() {
    local description="$1"
    shift

    if "$@" > /dev/null 2>&1; then
        echo "  ✔ ${description}"
        return
    fi

    echo "  ✘ ${description} (la commande a échoué)"
    failed_test_count=$((failed_test_count + 1))
}

assert_fails() {
    local description="$1"
    shift

    if ! "$@" > /dev/null 2>&1; then
        echo "  ✔ ${description}"
        return
    fi

    echo "  ✘ ${description} (la commande a réussi)"
    failed_test_count=$((failed_test_count + 1))
}

# Creates an empty commit with the given message on the current branch.
commit() {
    git commit --quiet --allow-empty --message "$1"
}

# Creates a remote repository and a clone of it, with main and dev, then moves into the clone.
create_project() {
    local project_name="$1"
    git init --quiet --bare --initial-branch=main "${WORKING_DIRECTORY}/${project_name}-remote.git"
    git clone --quiet "${WORKING_DIRECTORY}/${project_name}-remote.git" "${WORKING_DIRECTORY}/${project_name}" 2> /dev/null
    cd "${WORKING_DIRECTORY}/${project_name}"

    commit 'chore: initial commit'
    git push --quiet origin main
    git switch --quiet --create dev
    git push --quiet origin dev
}

# Merges a branch into the current one with a merge commit, like a GitHub pull request.
merge() {
    git merge --quiet --no-ff --no-edit "$1"
}

#=======#
# Tests #
#=======#

test_image_name() {
    echo 'to-image-name.sh'
    assert_equals 'minuscules' 'floraccess' "$(to-image-name.sh 'FlorAccess')"
    assert_equals 'séparateurs en tirets' 'my-api-server' "$(to-image-name.sh 'My_API.Server')"
    assert_equals 'tirets en trop' 'odd-name' "$(to-image-name.sh '--Odd  Name--')"
    assert_fails 'nom vide refusé' to-image-name.sh '___'
}

# Creates a new directory holding the given empty files, then moves into it.
move_into_new_project() {
    local project_directory
    project_directory=$(mktemp -d "${WORKING_DIRECTORY}/project-XXXX")
    cd "${project_directory}"

    local file_name
    for file_name in "$@"; do
        touch "${file_name}"
    done
}

# Prints the output expected from detect-project.sh.
expected_project() {
    local type="$1"
    local kind="$2"
    local has_dockerfile="$3"

    printf '%s\n' "type=${type}" "kind=${kind}" "has-dockerfile=${has_dockerfile}"
}

test_flutter_project_detection() {
    echo 'detect-project.sh : Flutter'

    move_into_new_project pubspec.yaml
    assert_equals '-lib : librairie' "$(expected_project flutter library false)" "$(detect-project.sh 'date-utils-lib')"
    assert_equals '-app sans Dockerfile : application mobile' "$(expected_project flutter application false)" "$(detect-project.sh 'floraccess-app')"
    assert_equals 'sans suffixe ni Dockerfile : librairie' "$(expected_project flutter library false)" "$(detect-project.sh 'date-utils' 2> /dev/null)"
    assert_fails '-extension refusé' detect-project.sh 'tab-saver-extension'

    move_into_new_project pubspec.yaml Dockerfile
    assert_equals 'sans suffixe avec Dockerfile : application' "$(expected_project flutter application true)" "$(detect-project.sh 'floraccess')"
    assert_equals '-app avec Dockerfile : application' "$(expected_project flutter application true)" "$(detect-project.sh 'floraccess-app')"
    assert_fails '-lib avec Dockerfile refusé' detect-project.sh 'date-utils-lib'

    move_into_new_project pubspec.yaml package.json
    assert_equals 'pubspec.yaml prioritaire sur package.json' "$(expected_project flutter application false)" "$(detect-project.sh 'floraccess-app')"
}

test_node_project_detection() {
    echo 'detect-project.sh : Node.js'

    move_into_new_project package.json
    assert_equals '-extension : extension' "$(expected_project extension extension false)" "$(detect-project.sh 'tab-saver-extension')"
    assert_equals '-lib : librairie' "$(expected_project nodejs library false)" "$(detect-project.sh 'date-utils-lib')"
    assert_fails '-app sans Dockerfile refusé' detect-project.sh 'floraccess-app'
    assert_fails 'sans suffixe ni Dockerfile refusé' detect-project.sh 'floraccess'

    move_into_new_project package.json Dockerfile
    assert_equals '-extension avec Dockerfile : extension' "$(expected_project extension extension true)" "$(detect-project.sh 'tab-saver-extension')"
    assert_equals 'sans suffixe avec Dockerfile : application' "$(expected_project nodejs application true)" "$(detect-project.sh 'floraccess')"
    assert_equals '-app avec Dockerfile : application' "$(expected_project nodejs application true)" "$(detect-project.sh 'floraccess-app')"
    assert_fails '-lib avec Dockerfile refusé' detect-project.sh 'date-utils-lib'

    echo '{ "scripts": { "astro": "astro" } }' > package.json
    assert_equals 'script « astro » sans dépendance : application Node.js' "$(expected_project nodejs application true)" "$(detect-project.sh 'floraccess')"

    echo '{ "dependencies": { "astro": "^5.0.0" } }' > package.json
    assert_equals 'dépendance astro : site Astro' "$(expected_project astro application true)" "$(detect-project.sh 'portfolio')"

    echo '{ "devDependencies": { "astro": "^5.0.0" } }' > package.json
    assert_equals 'dépendance de développement astro : site Astro' "$(expected_project astro application true)" "$(detect-project.sh 'portfolio-app')"

    move_into_new_project package.json
    echo '{ "dependencies": { "astro": "^5.0.0" } }' > package.json
    assert_equals 'librairie de composants Astro : librairie npm' "$(expected_project nodejs library false)" "$(detect-project.sh 'astro-components-lib')"
}

test_database_project_detection() {
    echo 'detect-project.sh : base de données'

    move_into_new_project Dockerfile
    assert_equals '-database avec Dockerfile : migrations' "$(expected_project database migrations true)" "$(detect-project.sh 'econoris-database')"

    move_into_new_project Dockerfile package.json
    assert_equals '-database prioritaire sur package.json' "$(expected_project database migrations true)" "$(detect-project.sh 'econoris-database')"

    move_into_new_project Dockerfile pubspec.yaml
    assert_equals '-database prioritaire sur pubspec.yaml' "$(expected_project database migrations true)" "$(detect-project.sh 'econoris-database')"

    move_into_new_project
    assert_fails '-database sans Dockerfile refusé' detect-project.sh 'econoris-database'
}

test_unknown_project_detection() {
    echo 'detect-project.sh : autres projets'

    move_into_new_project Dockerfile
    assert_fails 'ni pubspec.yaml ni package.json refusé' detect-project.sh 'floraccess-app'
}

test_pull_request_branches() {
    echo 'check-pull-request-branches.sh'
    assert_succeeds 'feature/* → dev' check-pull-request-branches.sh 'feature/login' 'dev'
    assert_succeeds 'fix/* → dev' check-pull-request-branches.sh 'fix/typo' 'dev'
    assert_succeeds 'dependabot/* → dev' check-pull-request-branches.sh 'dependabot/npm_and_yarn/express-5.1.0' 'dev'
    assert_succeeds 'main → dev (back-merge)' check-pull-request-branches.sh 'main' 'dev'
    assert_succeeds 'release/vX.Y.Z → main' check-pull-request-branches.sh 'release/v1.2.0' 'main'
    assert_succeeds 'hotfix/* → main' check-pull-request-branches.sh 'hotfix/crash' 'main'
    assert_succeeds 'autre cible libre' check-pull-request-branches.sh 'fix/typo' 'release/v1.2.0'
    assert_fails 'dev → main refusé' check-pull-request-branches.sh 'dev' 'main'
    assert_fails 'feature/* → main refusé' check-pull-request-branches.sh 'feature/login' 'main'
    assert_fails 'release/1.2.0 sans v refusé' check-pull-request-branches.sh 'release/1.2.0' 'main'
    assert_fails 'nom libre → dev refusé' check-pull-request-branches.sh 'my-branch' 'dev'
    assert_fails 'feature/ vide refusé' check-pull-request-branches.sh 'feature/' 'dev'
}

test_commit_messages() {
    echo 'check-commit-messages.sh'
    create_project 'commit-messages'

    git switch --quiet --create feature/valid
    commit 'feat(api): add the export'
    commit 'fix!: drop the old routes'
    assert_succeeds 'messages conventionnels acceptés' check-commit-messages.sh dev HEAD

    commit 'Update README.md'
    assert_fails 'message libre refusé' check-commit-messages.sh dev HEAD

    git switch --quiet dev
    git switch --quiet --create feature/merged
    commit 'docs: explain the setup'
    merge main
    assert_succeeds 'merge commits ignorés' check-commit-messages.sh dev HEAD
}

test_next_version() {
    echo 'compute-next-version.sh'
    create_project 'next-version'

    assert_equals 'sans tag : 0.1.0' '0.1.0' "$(compute-next-version.sh)"

    git tag v1.4.2 main
    assert_fails 'aucun commit depuis le tag : refusé' compute-next-version.sh main

    commit 'fix: typo'
    assert_equals 'fix : patch' '1.4.3' "$(compute-next-version.sh)"

    commit 'feat(ui): dark mode'
    assert_equals 'feat : mineure' '1.5.0' "$(compute-next-version.sh)"

    git tag v1.5.0-rc.1
    assert_equals 'tags rc ignorés' '1.5.0' "$(compute-next-version.sh)"

    git commit --quiet --allow-empty --message 'refactor: new storage' --message 'BREAKING CHANGE: the old files are no longer read'
    assert_equals 'BREAKING CHANGE en pied : majeure' '2.0.0' "$(compute-next-version.sh)"

    git tag v2.0.0
    commit 'perf(api)!: paginate everything'
    assert_equals 'type! : majeure' '3.0.0' "$(compute-next-version.sh)"
}

test_plan_release() {
    echo 'plan-release.sh'
    create_project 'plan-release'
    git tag v1.0.0 main
    git push --quiet origin v1.0.0

    git switch --quiet --create feature/export
    commit 'feat: CSV export'
    git switch --quiet dev
    merge feature/export
    git push --quiet origin dev

    local plan
    plan=$(EVENT_NAME=workflow_dispatch BRANCH_NAME=dev plan-release.sh)
    assert_equals 'bouton sur dev' "$(printf '%s\n' kind=candidate version=1.1.0-rc.1 tag=v1.1.0-rc.1 previous-tag=v1.0.0 new-release-branch=release/v1.1.0)" "${plan}"

    # The workflow creates the branch and the tag.
    git switch --quiet --create release/v1.1.0
    git push --quiet origin release/v1.1.0
    git tag v1.1.0-rc.1
    git fetch --quiet origin

    git switch --quiet dev
    assert_fails 'deuxième release refusée' env EVENT_NAME=workflow_dispatch BRANCH_NAME=dev plan-release.sh

    git switch --quiet release/v1.1.0
    commit 'fix: export encoding'
    plan=$(EVENT_NAME=workflow_dispatch BRANCH_NAME=release/v1.1.0 plan-release.sh)
    assert_equals 'bouton sur la release' "$(printf '%s\n' kind=candidate version=1.1.0-rc.2 tag=v1.1.0-rc.2 previous-tag=v1.0.0 new-release-branch=)" "${plan}"

    commit 'feat: another feature pushed on the release'
    git tag v1.1.0-rc.2
    commit 'feat!: breaking change pushed on the release'
    assert_fails 'release dont les commits changent la version refusée' env EVENT_NAME=workflow_dispatch BRANCH_NAME=release/v1.1.0 plan-release.sh
    git reset --quiet --hard HEAD~2

    git switch --quiet main
    merge release/v1.1.0
    plan=$(EVENT_NAME=push BRANCH_NAME=main plan-release.sh)
    assert_equals 'merge sur main' "$(printf '%s\n' kind=final version=1.1.0 tag=v1.1.0 previous-tag=v1.0.0 new-release-branch=)" "${plan}"

    git tag v1.1.0
    git push --quiet origin main v1.1.0
    plan=$(EVENT_NAME=push BRANCH_NAME=main plan-release.sh)
    assert_equals 'relance après publication : même version' "$(printf '%s\n' kind=final version=1.1.0 tag=v1.1.0 previous-tag=v1.0.0 new-release-branch=)" "${plan}"

    git switch --quiet dev
    commit 'feat: next feature'
    git push --quiet origin dev
    git fetch --quiet origin
    assert_fails 'main non mergée dans dev refusée' env EVENT_NAME=workflow_dispatch BRANCH_NAME=dev plan-release.sh

    merge main
    plan=$(EVENT_NAME=workflow_dispatch BRANCH_NAME=dev plan-release.sh)
    assert_equals 'branche de release déjà publiée ignorée' "$(printf '%s\n' kind=candidate version=1.2.0-rc.1 tag=v1.2.0-rc.1 previous-tag=v1.1.0 new-release-branch=release/v1.2.0)" "${plan}"

    git switch --quiet --create hotfix/crash main
    commit 'fix: crash on start'
    plan=$(EVENT_NAME=workflow_dispatch BRANCH_NAME=hotfix/crash plan-release.sh)
    assert_equals 'bouton sur un hotfix' "$(printf '%s\n' kind=candidate version=1.1.1-rc.1 tag=v1.1.1-rc.1 previous-tag=v1.1.0 new-release-branch=)" "${plan}"

    assert_fails 'bouton sur une feature refusé' env EVENT_NAME=workflow_dispatch BRANCH_NAME=feature/export plan-release.sh
    assert_fails 'push hors de main refusé' env EVENT_NAME=push BRANCH_NAME=dev plan-release.sh
}

# Writes a Node.js project (package.json and its lockfile) and a Flutter one (pubspec.yaml)
# at the given version, in the current directory.
write_project_files() {
    local version="$1"

    printf '{\n    "name": "demo",\n    "version": "%s"\n}\n' "${version}" > package.json
    printf '{\n  "name": "demo",\n  "version": "%s",\n  "lockfileVersion": 3,\n  "packages": {\n    "": { "name": "demo", "version": "%s" }\n  }\n}\n' "${version}" "${version}" > package-lock.json
    printf 'name: demo\nversion: %s+7 # build number kept\n\nenvironment:\n  sdk: ^3.0.0\n' "${version}" > pubspec.yaml
}

test_write_version_files() {
    echo 'write-version-files.sh'

    move_into_new_project
    write_project_files '0.0.0'
    write-version-files.sh '1.5.0'
    assert_equals 'package.json' '1.5.0' "$(jq --raw-output '.version' package.json)"
    assert_equals 'indentation de package.json conservée' '    "version": "1.5.0"' "$(grep '"version"' package.json)"
    assert_equals 'package-lock.json' '1.5.0' "$(jq --raw-output '.version' package-lock.json)"
    assert_equals 'package-lock.json, packages[""]' '1.5.0' "$(jq --raw-output '.packages[""].version' package-lock.json)"
    assert_equals 'pubspec.yaml, build number conservé' 'version: 1.5.0+7' "$(grep '^version:' pubspec.yaml)"

    printf 'name: demo\n' > pubspec.yaml
    write-version-files.sh '1.5.0'
    assert_equals 'pubspec.yaml sans version : ligne ajoutée' 'version: 1.5.0' "$(grep '^version:' pubspec.yaml)"

    move_into_new_project Dockerfile
    assert_succeeds 'aucun fichier de version : rien à faire' write-version-files.sh '1.5.0'
}

test_check_version_files() {
    echo 'check-version-files.sh'
    create_project 'check-version-files'

    write_project_files '1.5.0'
    git add --all
    commit 'chore: add the version files'
    assert_succeeds 'fichiers à jour acceptés' check-version-files.sh '1.5.0'
    assert_fails 'fichiers en retard refusés' check-version-files.sh '1.6.0'

    jq '.packages[""].version = "1.4.0"' package-lock.json > package-lock.tmp && mv package-lock.tmp package-lock.json
    git commit --quiet --all --message 'chore: lockfile left behind'
    assert_fails 'packages[""] en retard refusé' check-version-files.sh '1.5.0'
    assert_succeeds 'lecture depuis une référence git' check-version-files.sh '1.5.0' HEAD~1

    git rm --quiet package.json package-lock.json pubspec.yaml
    commit 'chore: remove the version files'
    assert_succeeds 'aucun fichier de version : accepté' check-version-files.sh '1.5.0'
}

test_commit_version_files() {
    echo 'commit-version-files.sh'
    create_project 'commit-version-files'

    write_project_files '0.0.0'
    git add --all
    commit 'feat: first feature'
    git push --quiet origin dev
    local built_commit
    built_commit=$(git rev-parse HEAD)

    local output
    output=$(commit-version-files.sh 'release/v1.0.0' '1.0.0' 2> /dev/null)
    local version_commit="${output#commit=}"
    assert_equals 'branche créée sur le commit de version' "${version_commit}" "$(git ls-remote --heads origin release/v1.0.0 | cut -f 1)"
    assert_equals 'commit de version posé sur le commit construit' "${built_commit}" "$(git rev-parse "${version_commit}^")"
    assert_equals 'message du commit de version' 'chore(release): v1.0.0' "$(git log -1 --format=%s "${version_commit}")"
    assert_succeeds 'fichiers de la branche à jour' check-version-files.sh '1.0.0' "${version_commit}"

    git checkout --quiet "${built_commit}"
    output=$(commit-version-files.sh 'release/v1.0.0' '1.0.0' 2> /dev/null)
    assert_equals 'relance : commit de version conservé' "commit=${version_commit}" "${output}"

    git checkout --quiet "${version_commit}"
    output=$(commit-version-files.sh 'release/v1.0.0' '1.0.0' 2> /dev/null)
    assert_equals 'fichiers déjà à jour : commit construit' "commit=${version_commit}" "${output}"
    assert_equals 'fichiers déjà à jour : branche inchangée' "${version_commit}" "$(git ls-remote --heads origin release/v1.0.0 | cut -f 1)"

    git switch --quiet --create hotfix/crash "${built_commit}"
    git push --quiet origin hotfix/crash
    output=$(commit-version-files.sh 'hotfix/crash' '0.1.1' 2> /dev/null)
    assert_equals 'branche existante sur le commit construit : commit de version poussé' "${output#commit=}" "$(git ls-remote --heads origin hotfix/crash | cut -f 1)"

    git switch --quiet --create fix/moved "${built_commit}"
    commit 'fix: pushed during the run'
    git push --quiet origin HEAD:refs/heads/hotfix/moved
    git checkout --quiet "${built_commit}"
    assert_fails 'branche modifiée pendant le run : refusé' commit-version-files.sh 'hotfix/moved' '0.1.1'
}

test_image_name
test_flutter_project_detection
test_node_project_detection
test_database_project_detection
test_unknown_project_detection
test_pull_request_branches
test_commit_messages
test_next_version
test_plan_release
test_write_version_files
test_check_version_files
test_commit_version_files

echo
if [ "${failed_test_count}" -gt 0 ]; then
    echo "${failed_test_count} test(s) en échec."
    exit 1
fi

echo 'Tous les tests passent.'
