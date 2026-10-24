# Gitflow

La partie commune à tous les types de projets : règles du git flow, calcul de version, image Docker, GitHub Release et back-merge.

Un projet n'utilise jamais ce dossier directement. Il passe par la CI de son type ([nodejs](../nodejs/README.md), [astro](../astro/README.md), [flutter](../flutter/README.md)), qui appelle ces briques.

## Les branches

| Branche | Rôle | Créée par |
|---|---|---|
| `main` | Production : chaque merge publie une version finale | — |
| `dev` | Intégration : les fonctionnalités terminées | — |
| `feature/*`, `feat/*` | Une fonctionnalité, mergée dans `dev` | Toi |
| `bugfix/*`, `fix/*` | Un correctif non urgent, mergé dans `dev` | Toi |
| `release/vX.Y.Z` | Une version en préparation, mergée dans `main` | Le bouton, sur `dev` |
| `hotfix/*` | Un correctif urgent de production, parti de `main` et mergé dans `main` | Toi |
| `dependabot/*` | Mises à jour de dépendances, mergées dans `dev` | Dependabot |

### Pull requests autorisées

| Vers | Depuis |
|---|---|
| `dev` | `feature/*`, `feat/*`, `bugfix/*`, `fix/*`, `dependabot/*`, `main` (back-merge) |
| `main` | `release/vX.Y.Z`, `hotfix/*` |
| Autre branche | Libre |

Les pull requests se mergent toujours avec **Create a merge commit** : les commits arrivent tels quels, ce qui permet de calculer la version.

### Une seule release à la fois

Le bouton sur `dev` est refusé tant qu'une branche `release/vX.Y.Z` existe sans que sa version soit publiée. Deux releases ouvertes ensemble pourraient être publiées dans le désordre, et `latest` reculerait.

- Pour abandonner une release : fermer sa pull request et supprimer sa branche.
- Pour corriger une release : pousser le correctif directement sur `release/vX.Y.Z`.

Un hotfix peut avancer pendant qu'une release est en cours.

## Le bouton

Onglet **Actions** → **CI** → **Run workflow**. Ce qu'il fait dépend de la branche choisie :

| Branche | Résultat |
|---|---|
| `dev` | Release candidate `vX.Y.Z-rc.1` : image Docker, pre-release GitHub, création de `release/vX.Y.Z` et de sa pull request vers `main` |
| `release/vX.Y.Z` | Release candidate suivante, `vX.Y.Z-rc.2`, `rc.3`… |
| `hotfix/*` | Release candidate du hotfix, par exemple `v1.4.3-rc.1` |
| Autre | Refusé |

Une release candidate n'est publiée que par ce bouton. Sur `dev`, il faut aussi que `main` soit déjà mergée dans `dev` (pull request de back-merge mergée).

## Calcul de la version

La version vient des messages de commit ajoutés depuis le dernier tag `vX.Y.Z`. Ils suivent [Conventional Commits](https://www.conventionalcommits.org/fr/), et la montée la plus forte l'emporte :

| Message | Montée | Exemple |
|---|---|---|
| `feat!: …`, `fix(api)!: …` ou une ligne `BREAKING CHANGE: …` dans le corps | Majeure | `1.4.2` → `2.0.0` |
| `feat: …`, `feat(ui): …` | Mineure | `1.4.2` → `1.5.0` |
| Tout le reste : `fix`, `perf`, `refactor`, `docs`, `chore`… | Corrective | `1.4.2` → `1.4.3` |

- Types acceptés : `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Un commit qui n'en utilise aucun bloque la pull request.
- Les merge commits sont ignorés.
- Les tags de release candidate (`v1.5.0-rc.2`) sont ignorés.
- Un projet sans aucun tag `vX.Y.Z` commence à `0.1.0`.
- Une branche `release/vX.Y.Z` doit toujours correspondre à la version que donnent ses commits. Elles divergent si un `feat` ou un changement cassant est poussé sur la release après sa création : la pull request vers `main` est alors bloquée.

## Ce qui est publié

Le nom vient du dépôt, en minuscules, avec des tirets à la place des autres caractères : `FlorAccess` → `floraccess`, `My_API.Server` → `my-api-server`.

### Application ou librairie

Le suffixe du nom dit ce qu'est le projet, et donc ce que la CI de son type construit :

| Nom | Type | Règle sur le `Dockerfile` |
|---|---|---|
| `…-app` | Application : image Docker, build Android… | Selon le type de projet |
| `…-lib` | Librairie : paquet npm, simple tag git… | Interdit, la CI échoue s'il existe |
| Autre | Application s'il y a un `Dockerfile`, librairie sinon | Un avertissement demande de renommer le dépôt |

Ce que chaque type fait d'une application ou d'une librairie est décrit dans son README. Le tableau ci-dessous concerne une application publiée en image Docker.

| | Release candidate | Version finale |
|---|---|---|
| Tag git | `v1.5.0-rc.2` | `v1.5.0` |
| GitHub Release | Pre-release | Release, notes générées depuis la version précédente |
| Image GHCR | `ghcr.io/<owner>/<nom>:1.5.0-rc.2` | `ghcr.io/<owner>/<nom>:1.5.0` et `:latest` |
| Image Docker Hub | `<utilisateur>/<nom>:1.5.0-rc.2` | `<utilisateur>/<nom>:1.5.0` et `:latest` |

L'image Docker Hub n'est publiée que si les secrets `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN` existent. La version est passée au `Dockerfile` dans l'argument de build `APP_VERSION`.

## Installer dans un projet

À faire une fois par projet, en plus du fichier `ci.yml` décrit dans le README du type.

### 1. Les réglages du dépôt

| Où | Quoi |
|---|---|
| Settings → General → Pull Requests | Ne garder que **Allow merge commits**. Cocher **Automatically delete head branches**. |
| Settings → Actions → General → Workflow permissions | Cocher **Allow GitHub Actions to create and approve pull requests** : la CI ouvre les pull requests de release et de back-merge. |
| Settings → Rules → Rulesets → New ruleset → Import a ruleset | Importer [rulesets/protected-branches.json](rulesets/protected-branches.json) et [rulesets/branch-names.json](rulesets/branch-names.json). |

Les rulesets sont les garde-fous que la CI ne peut pas poser elle-même :

- **protected-branches** : sur `main` et `dev`, plus de push direct ni de suppression, pull request obligatoire, merge commit imposé, vérifications `ci / Gitflow / Checks` et `ci / Quality` obligatoires.
- **branch-names** : refuse la création de toute branche dont le nom ne fait pas partie du git flow.

### 2. Les secrets, tous facultatifs

Settings → Secrets and variables → Actions :

| Secret | Effet |
|---|---|
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | Publie aussi l'image sur Docker Hub. Le token se crée dans Docker Hub → Account settings → Personal access tokens, en *Read & Write*. |
| `GITFLOW_TOKEN` | Voir ci-dessous. |
| `NPM_TOKEN` | Librairie Node.js : publie sur npmjs.com sans trusted publishing. Voir [nodejs/README.md](../nodejs/README.md#le-paquet-npm). |

**Pourquoi `GITFLOW_TOKEN` ?** GitHub ne lance aucun workflow sur une pull request ouverte avec le jeton par défaut des Actions. Sans ce secret, les vérifications des pull requests de release et de back-merge ne démarrent pas : il faut fermer puis rouvrir la pull request pour les lancer. Pour l'éviter, créer un *fine-grained personal access token* (Settings du compte → Developer settings) limité au projet, avec **Contents** et **Pull requests** en lecture et écriture, et l'enregistrer dans ce secret.

### 3. Un projet qui a déjà une version

Pour qu'un projet existant reparte de sa version actuelle, par exemple `2.3.0`, créer une fois le tag `v2.3.0` sur `main` (onglet Releases → Draft a new release). La version suivante sera `2.3.1`, `2.4.0` ou `3.0.0`.

### 4. Dependabot, si utilisé

Ses messages de commit doivent suivre Conventional Commits. Dans `.github/dependabot.yml`, pour chaque écosystème :

```yaml
    target-branch: dev
    commit-message:
      prefix: "chore(deps)"
```

## Au quotidien

1. **Développer** sur `feature/ma-fonctionnalite`, avec des commits du type `feat: ajoute l'export CSV`, puis ouvrir une pull request vers `dev`.
2. **Préparer une version** : bouton sur `dev`. La branche `release/vX.Y.Z` et sa pull request sont créées, avec l'image `X.Y.Z-rc.1` à essayer.
3. **Corriger si besoin** : pousser sur `release/vX.Y.Z`, puis bouton sur cette branche pour obtenir `rc.2`.
4. **Publier** : merger la pull request de release dans `main`.
5. **Resynchroniser** : merger la pull request de back-merge `main` → `dev`.
6. **Déployer** à la main sur le serveur, avec l'image `X.Y.Z`.

Pour un **hotfix** : créer `hotfix/description` depuis `main`, corriger avec des commits `fix: …`, éventuellement bouton sur la branche pour une release candidate, puis pull request vers `main`. Le merge publie la version corrective et ouvre le back-merge.

Si une publication échoue en cours de route, relancer le run (**Re-run failed jobs**) : chaque étape reprend là où elle s'était arrêtée sans rien dupliquer.

## Contenu du dossier

### Workflows réutilisables

Ils sont dans [.github/workflows](../.github/workflows) à la racine du dépôt, car GitHub l'impose.

| Fichier | Rôle |
|---|---|
| [gitflow-checks.yml](../.github/workflows/gitflow-checks.yml) | Pull request : règles de branches, messages de commit, version d'une release |
| [gitflow-prepare-release.yml](../.github/workflows/gitflow-prepare-release.yml) | Bouton ou merge sur `main` : décide quoi publier (version, tag, branche à créer, application ou librairie). N'écrit rien. |
| [gitflow-docker-image.yml](../.github/workflows/gitflow-docker-image.yml) | Construit l'image d'une application une fois et la pousse sur GHCR et Docker Hub |
| [gitflow-publish-release.yml](../.github/workflows/gitflow-publish-release.yml) | Branche de release et sa pull request, tag et GitHub Release, back-merge |

Ordre d'appel par une CI de type : `gitflow-checks` en parallèle de la qualité sur une pull request, sinon qualité → `prepare-release` → builds → `publish-release`. Rien n'est tagué ni publié sur GitHub tant que tous les builds n'ont pas réussi.

### Scripts

[scripts/](scripts) est aussi une composite action : `uses: FloRobart/Github-ci/gitflow/scripts@main` ajoute les scripts au `PATH` du job, sans checkout de ce dépôt.

| Script | Rôle |
|---|---|
| [common.sh](scripts/common.sh) | Motifs de version et fonctions partagées |
| [check-pull-request-branches.sh](scripts/check-pull-request-branches.sh) | Pull requests autorisées vers `dev` et `main` |
| [check-commit-messages.sh](scripts/check-commit-messages.sh) | Conventional Commits |
| [check-release-branch-version.sh](scripts/check-release-branch-version.sh) | Une `release/vX.Y.Z` correspond à ses commits |
| [compute-next-version.sh](scripts/compute-next-version.sh) | Version suivante depuis les commits |
| [plan-release.sh](scripts/plan-release.sh) | Ce que le run publie |
| [to-image-name.sh](scripts/to-image-name.sh) | Nom de l'image depuis le nom du dépôt |
| [detect-project-kind.sh](scripts/detect-project-kind.sh) | Application ou librairie, depuis le suffixe du nom et le `Dockerfile` |
| [create-branch.sh](scripts/create-branch.sh) | Crée une branche sur GitHub |
| [open-pull-request.sh](scripts/open-pull-request.sh) | Ouvre une pull request si elle n'existe pas encore |
| [create-github-release.sh](scripts/create-github-release.sh) | Tag et GitHub Release |

Tests : `gitflow/tests/run-tests.sh`.

## Dépannage

| Symptôme | Cause |
|---|---|
| Pull request bloquée sur « Expected — Waiting for status to be reported » | Pull request ouverte par la CI sans `GITFLOW_TOKEN` : la fermer puis la rouvrir. Sinon, vérifier que le job du `ci.yml` du projet s'appelle bien `ci`. |
| « Message de commit invalide » | Corriger les messages avec `git rebase -i`, puis `git push --force-with-lease`. Un revert fait depuis l'interface de GitHub (« Revert "…" ») est refusé : écrire `revert: …`. |
| « main non mergée dans dev » | Merger la pull request de back-merge `main` → `dev` avant de relancer le bouton. |
| « Release déjà en cours » | Publier ou abandonner la release en cours. |
| « Rien à publier » | Aucun commit depuis la dernière version. |
| « Librairie avec un Dockerfile » | Un dépôt `…-lib` a un `Dockerfile` : le supprimer, ou renommer le dépôt en `…-app`. |
| « Dockerfile manquant » | Une application doit être publiée en image Docker mais n'a pas de `Dockerfile` à la racine. |
| Avertissement « Nom sans suffixe » | Le dépôt ne finit ni par `-app` ni par `-lib` : le type est deviné depuis le `Dockerfile`. Renommer le dépôt pour lever le doute. |
| Le bouton **Run workflow** n'apparaît pas | Le fichier `ci.yml` doit exister sur la branche par défaut du dépôt. |
