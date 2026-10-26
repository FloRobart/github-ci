# Guide pas à pas : brancher un dépôt sur la CI

Ce guide se suit **dans l'ordre**, de haut en bas, une fois par dépôt. Chaque étape dit où cliquer et quoi vérifier avant de passer à la suivante.

L'ordre compte : les fichiers sont poussés **avant** de protéger les branches, car une fois les rulesets actifs, plus personne (même toi) ne peut pousser directement sur `main` ou `dev`.

> Durée : environ 15 minutes pour un dépôt simple (étapes 1 à 7), plus le temps des stores si tu publies sur Google Play, pub.dev, Chrome ou Firefox.

---

## Sommaire

- [Étape 0 : prérequis uniques (une seule fois, pour tous les dépôts)](#étape-0--prérequis-uniques)
- [Étape 1 : choisir le nom du dépôt](#étape-1--choisir-le-nom-du-dépôt)
- [Étape 2 : préparer le code du projet](#étape-2--préparer-le-code-du-projet)
- [Étape 3 : ajouter le fichier de CI et créer `dev`](#étape-3--ajouter-le-fichier-de-ci-et-créer-dev)
- [Étape 4 : régler le dépôt](#étape-4--régler-le-dépôt)
- [Étape 5 : créer le secret `GITFLOW_TOKEN`](#étape-5--créer-le-secret-gitflow_token)
- [Étape 6 : les autres secrets, selon le projet](#étape-6--les-autres-secrets-selon-le-projet)
- [Étape 7 : protéger les branches](#étape-7--protéger-les-branches)
- [Étape 8 : projet qui a déjà une version](#étape-8--projet-qui-a-déjà-une-version)
- [Étape 9 : Dependabot](#étape-9--dependabot)
- [Étape 10 : tester toute la chaîne](#étape-10--tester-toute-la-chaîne)
- [En cas de problème](#en-cas-de-problème)
- [Check-list récapitulative](#check-list-récapitulative)

---

## Étape 0 : prérequis uniques

À faire **une seule fois**, pas à chaque dépôt.

### 0.1 Le dépôt Github-ci est accessible

Les projets appellent `FloRobart/github-ci/...@main`. Si `Github-ci` est **public**, rien à faire.

S'il est **privé** :

1. Ouvrir le dépôt `FloRobart/github-ci` sur GitHub.
2. **Settings** → **Actions** → **General**.
3. Descendre jusqu'à la section **Access**.
4. Choisir **Accessible from repositories owned by the user 'FloRobart'**.
5. **Save**.

### 0.2 Récupérer les fichiers de rulesets sur ton poste

L'étape 7 importe deux fichiers JSON. Les avoir sous la main :

- [gitflow/rulesets/protected-branches.json](gitflow/rulesets/protected-branches.json)
- [gitflow/rulesets/branch-names.json](gitflow/rulesets/branch-names.json)

Ils sont déjà dans ce dépôt cloné : `~/Documents/Projet_perso/Web/github-ci/gitflow/rulesets/`.

---

## Étape 1 : choisir le nom du dépôt

La CI devine le type du projet à partir des fichiers à la racine **et** du suffixe du nom du dépôt. Un mauvais nom = un projet refusé ou mal publié.

| Ce que tu fais | Nom du dépôt | Fichiers à la racine | Ce qui est publié |
|---|---|---|---|
| Application / API Node.js | libre (ex. `econoris-api`) | `package.json` + `Dockerfile` | Image Docker |
| Site Astro | libre (ex. `portfolio`) | `package.json` (avec la dépendance `astro`) + `Dockerfile` | Image Docker |
| Librairie Node.js | `…-lib` | `package.json`, **sans** `Dockerfile` | Paquet npm |
| Extension navigateur | `…-extension` | `package.json` | `.zip`, Chrome Web Store, Firefox |
| Application Flutter | `…-app`, ou libre avec un `Dockerfile` | `pubspec.yaml` (+ `Dockerfile` pour la version web) | APK / AAB, Google Play, image web |
| Librairie Flutter | `…-lib` | `pubspec.yaml`, **sans** `Dockerfile` | GitHub Release, pub.dev |
| Migrations de base de données | `…-database` | `Dockerfile` | Image Docker `…-migrations` |

**Pour renommer un dépôt** : **Settings** → **General** → champ **Repository name** → **Rename**.

✅ **Vérification** : ton projet est dans une ligne du tableau. Les cas refusés sont détaillés dans [gitflow/README.md → Type de projet](gitflow/README.md#type-de-projet).

---

## Étape 2 : préparer le code du projet

La CI échoue si un prérequis manque. Fais-le sur ta branche de travail en local, il sera poussé à l'étape 3.

### Si c'est un projet Node.js, Astro ou une extension

1. Utiliser **npm** et commiter le `package-lock.json` (la CI fait `npm ci`).
2. Avoir **tous** ces scripts dans `package.json` :

   ```json
   {
     "scripts": {
       "lint": "eslint .",
       "format:check": "prettier --check .",
       "typecheck": "tsc --noEmit",
       "test": "vitest run"
     }
   }
   ```

   - Astro : `"typecheck": "astro check"` (avec `@astrojs/check` en devDependency) et `"build": "astro build"`.
   - Extension et librairie : un script `"build"` en plus.
   - Pas de tests ? Écrire `"test": "echo 'Aucun test'"`. Un script absent fait échouer la CI.
3. Vérifier en local que tout passe :

   ```bash
   npm ci && npm run lint && npm run format:check && npm run typecheck && npm test
   ```

**En plus, pour une librairie Node.js** :

- Nom scopé en minuscules : `"name": "@florobart/mon-projet"`.
- Champs `main` (ou `exports`), `types`, `files` et `repository`.
- La `version` du `package.json` n'a pas d'importance, la CI la remplace.

**En plus, pour une extension** :

- `npm run build` produit `dist/` avec le `manifest.json` dedans.
- Pour Firefox, dans le manifest : `"browser_specific_settings": { "gecko": { "id": "mon-extension@florobart.dev" } }`.

### Si c'est un projet Flutter

1. Un dossier `test/` avec au moins un test.
2. Un code formaté : `dart format .` puis commiter.
3. Vérifier en local :

   ```bash
   dart format --set-exit-if-changed . && flutter analyze && flutter test
   ```

4. Pour une version web en image Docker : un `Dockerfile` qui construit lui-même le web (modèle : [flutter/example/Dockerfile](flutter/example/Dockerfile)).

### Si c'est un projet de migrations (`…-database`)

1. Les migrations dans `db/migrations/*.sql`, chacune avec `-- migrate:up` **et** `-- migrate:down`.
2. Un `Dockerfile` :

   ```dockerfile
   FROM ghcr.io/amacneil/dbmate:2.36.0

   COPY ./db/migrations /db/migrations

   CMD ["--wait", "--no-dump-schema", "up"]
   ```

3. Un `.dockerignore` :

   ```text
   *
   !db/migrations
   ```

### Pour tous les projets avec un `Dockerfile` (facultatif)

Récupérer la version calculée par la CI :

```dockerfile
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
```

✅ **Vérification** : les commandes de vérification locales passent sans erreur.

---

## Étape 3 : ajouter le fichier de CI et créer `dev`

### 3.1 Copier le fichier

1. Dans le projet, créer le dossier `.github/workflows/`.
2. Y copier [auto/example/ci.yml](auto/example/ci.yml) sous le nom **`ci.yml`**.
3. **Ne rien modifier**. En particulier, le job doit rester nommé `ci` : les protections de branches attendent des vérifications nommées `ci / Project / ...`.

Depuis le dossier du projet :

```bash
mkdir -p .github/workflows && cp ~/Documents/Projet_perso/Web/github-ci/auto/example/ci.yml .github/workflows/ci.yml
```

### 3.2 Pousser sur `main`

Commiter avec un message au format **Conventional Commits** (la CI vérifiera ce format sur toutes les pull requests suivantes) :

```bash
git add .github/workflows/ci.yml && git commit -m "ci: add Github-ci workflow"
```

```bash
git push origin main
```

### 3.3 Créer la branche `dev` depuis `main`

`ci.yml` doit exister sur `main` **et** sur `dev`. Le plus simple est de créer `dev` après avoir poussé `main` :

```bash
git switch -c dev && git push -u origin dev
```

Si `dev` existe déjà, y merger `main` puis pousser.

✅ **Vérification** : onglet **Actions** du dépôt → le workflow **CI** apparaît dans la liste à gauche, avec un run lancé par le push sur `main`. Il est normal que ce premier run fasse une première release s'il y a des commits `feat:`/`fix:`.

---

## Étape 4 : régler le dépôt

### 4.1 Méthode de merge

1. **Settings** → **General**.
2. Descendre jusqu'à **Pull Requests**.
3. ✅ Cocher **Allow merge commits**.
4. ⬜ Décocher **Allow squash merging**.
5. ⬜ Décocher **Allow rebase merging**.
6. ✅ Cocher **Automatically delete head branches** (un peu plus bas).

Pourquoi : le git flow compare les historiques de `main` et `dev`. Un squash ou un rebase crée de nouveaux commits et casse le calcul de version et le back-merge.

### 4.2 Autoriser la CI à ouvrir des pull requests

1. **Settings** → **Actions** → **General**.
2. Descendre jusqu'à **Workflow permissions**.
3. Laisser **Read repository contents and packages permissions** (le `ci.yml` demande lui-même les droits dont il a besoin).
4. ✅ Cocher **Allow GitHub Actions to create and approve pull requests**.
5. **Save**.

Pourquoi : la CI ouvre elle-même la pull request `release/vX.Y.Z` → `main` et la pull request de back-merge `main` → `dev`.

### 4.3 Vérifier que les Actions sont activées

Même page, en haut, **Actions permissions** : **Allow all actions and reusable workflows** (ou au minimum autoriser `FloRobart/*` et les actions utilisées par la CI).

✅ **Vérification** : les trois réglages sont enregistrés.

---

## Étape 5 : créer le secret `GITFLOW_TOKEN`

Fortement recommandé. Sans lui, GitHub ne lance **aucune** vérification sur les pull requests ouvertes par la CI (release et back-merge) : elles restent bloquées sur « Waiting for status » et il faut les fermer puis les rouvrir à la main.

### 5.1 Créer le token

1. En haut à droite sur GitHub : ta photo → **Settings** (les réglages **du compte**, pas du dépôt).
2. Tout en bas à gauche : **Developer settings**.
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
4. Remplir :

   | Champ | Valeur |
   |---|---|
   | Token name | `gitflow-<nom-du-depot>` |
   | Expiration | La durée que tu veux (penser à le renouveler avant expiration) |
   | Resource owner | `FloRobart` |
   | Repository access | **Only select repositories** → choisir le dépôt |

5. Dans **Permissions** → **Repository permissions** :

   | Permission | Niveau |
   |---|---|
   | **Contents** | Read and write |
   | **Pull requests** | Read and write |
   | Metadata | Read-only (ajouté automatiquement) |

6. **Generate token**, puis **copier** le token (il ne sera plus jamais affiché).

> Astuce : un seul token peut couvrir plusieurs dépôts (sélectionner tous les dépôts concernés à l'étape 4). Il suffit alors de coller le même token dans le secret de chaque dépôt, et de le mettre à jour partout quand il expire.

### 5.2 L'enregistrer dans le dépôt

1. Dans le dépôt : **Settings** → **Secrets and variables** → **Actions**.
2. Onglet **Secrets** → **New repository secret**.
3. **Name** : `GITFLOW_TOKEN` (exactement, en majuscules).
4. **Secret** : coller le token.
5. **Add secret**.

C'est la même procédure (5.2) pour **tous** les secrets de l'étape 6.

✅ **Vérification** : `GITFLOW_TOKEN` apparaît dans la liste **Repository secrets**.

---

## Étape 6 : les autres secrets, selon le projet

Tous facultatifs : sans eux, l'étape concernée est simplement ignorée avec un message, la CI ne plante pas. Tu peux donc les ajouter plus tard.

Ne lis que les sections qui concernent ton projet.

### 6.1 Docker Hub (toutes les applications avec un `Dockerfile`)

L'image est **toujours** publiée sur GHCR (`ghcr.io/florobart/<nom>`) sans rien configurer. Pour la publier **aussi** sur Docker Hub :

1. Sur [hub.docker.com](https://hub.docker.com) : ta photo → **Account settings** → **Personal access tokens** → **Generate new token**.
2. Description : `github-ci`, Access permissions : **Read & Write** → **Generate** → copier.
3. Dans le dépôt, ajouter deux secrets :

   | Secret | Valeur |
   |---|---|
   | `DOCKERHUB_USERNAME` | Ton nom d'utilisateur Docker Hub |
   | `DOCKERHUB_TOKEN` | Le token copié |

### 6.2 Librairie Node.js (`…-lib`) sur npmjs.com

Le paquet est **toujours** publié sur GitHub Packages. Sur npmjs.com, seulement si le dépôt est **public**.

Méthode recommandée, **sans secret** (trusted publishing) :

1. Le scope `@florobart` doit t'appartenir sur npmjs.com (ton utilisateur ou une organisation de ce nom).
2. Publier la **première** version à la main depuis ton poste : `npm publish --access public`.
3. Sur npmjs.com → le paquet → **Settings** → **Trusted publishing** → **GitHub Actions** :

   | Champ | Valeur |
   |---|---|
   | Organization or user | `FloRobart` |
   | Repository | le nom du dépôt |
   | Workflow filename | `ci.yml` |
   | Environment | vide |

Méthode alternative : un *granular access token* npm en écriture dans le secret `NPM_TOKEN` (expire au bout de 90 jours maximum).

### 6.3 Application Flutter : signature Android

Sans ces secrets, un APK signé avec la clé de debug est publié (installable, mais refusé par les stores).

1. Créer la clé (une fois, à garder précieusement, hors du dépôt) :

   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```

2. Encoder le fichier :

   ```bash
   base64 --wrap=0 upload-keystore.jks
   ```

3. Ajouter **les quatre** secrets (la CI échoue s'il en manque un) :

   | Secret | Valeur |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | La sortie de la commande `base64` |
   | `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | Mot de passe de la clé |

4. Dans le projet, faire lire `android/key.properties` par `android/app/build.gradle(.kts)` ([doc Flutter](https://docs.flutter.dev/deployment/android#configure-signing-in-gradle)).
5. Ajouter `key.properties` et `*.jks` au `.gitignore`.

### 6.4 Application Flutter : Google Play

Nécessite la signature (6.3).

1. Créer l'application dans la Play Console et y envoyer **la première version à la main** (l'AAB attaché à une release candidate GitHub).
2. Dans Google Cloud : activer l'API **Google Play Android Developer**, créer un **compte de service**, puis une **clé JSON**.
3. Play Console → **Utilisateurs et autorisations** → **Inviter un utilisateur** → l'adresse du compte de service, avec les droits de publication.
4. Secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` = tout le contenu du fichier JSON.

Compte développeur récent : mettre `google-play-track: alpha` dans le `ci.yml` le temps d'avoir accès à la production (voir [auto/README.md → Options](auto/README.md#options)).

### 6.5 Librairie Flutter : pub.dev

Dépôt **public** uniquement. La procédure complète (compte de service Google Cloud et commandes `gcloud`) est dans [flutter/README.md → pub.dev](flutter/README.md#pubdev). En résumé :

1. Publier la première version à la main : `flutter pub publish`.
2. Créer un compte de service Google Cloud et sa clé JSON.
3. Secret `PUB_DEV_SERVICE_ACCOUNT_JSON` = contenu du fichier, puis supprimer le fichier.
4. pub.dev → le paquet → **Admin** → **Automated publishing** → activer avec l'adresse du compte de service.

### 6.6 Extension : Chrome Web Store et Firefox

Publier **la première version à la main** sur chaque store, la CI ne fait que des mises à jour.

Chrome Web Store (les cinq sont obligatoires) :

| Secret | Où le trouver |
|---|---|
| `CHROME_EXTENSION_ID` | Dans l'URL de l'extension sur la console développeur |
| `CHROME_PUBLISHER_ID` | Console développeur → compte |
| `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` | Client OAuth Google Cloud, API Chrome Web Store activée |
| `CHROME_REFRESH_TOKEN` | Généré pour ce client OAuth |

Guide pour générer ces identifiants : [chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys).

Firefox (addons.mozilla.org → **Outils** → **Gérer les clés d'API**) :

| Secret | Valeur |
|---|---|
| `FIREFOX_API_KEY` | *JWT issuer* |
| `FIREFOX_API_SECRET` | *JWT secret* |

✅ **Vérification** : **Settings** → **Secrets and variables** → **Actions** liste les secrets voulus, avec des noms exacts (une faute de frappe = secret ignoré, sans erreur).

---

## Étape 7 : protéger les branches

⚠️ À faire **après** l'étape 3 : ensuite, `main` et `dev` ne se modifient plus que par pull request.

### 7.1 Protéger `main` et `dev`

1. **Settings** → **Rules** → **Rulesets**.
2. Bouton **New ruleset** → **Import a ruleset**.
3. Choisir le fichier `gitflow/rulesets/protected-branches.json`.
4. Le formulaire s'ouvre prérempli. Vérifier :
   - **Enforcement status** : **Active** ;
   - **Target branches** : `main` et `dev` ;
   - **Require status checks to pass** : `ci / Project / Gitflow / Checks` et `ci / Project / Quality`.
5. **Create** en bas de page.

> Projet qui appelle directement une CI de type (`nodejs.yml`…) au lieu de `auto.yml` : importer `protected-branches-type-ci.json` à la place.

### 7.2 Imposer les noms de branches

1. **New ruleset** → **Import a ruleset**.
2. Choisir `gitflow/rulesets/branch-names.json`.
3. Vérifier **Enforcement status** : **Active**, puis **Create**.

Noms de branches autorisés ensuite : `main`, `dev`, `feature/*`, `feat/*`, `bugfix/*`, `fix/*`, `hotfix/*`, `release/v*`, `dependabot/*`. Toute autre création est refusée.

> Les rulesets n'ont **aucune exception** (pas de bypass), même pour l'administrateur. Pour un cas exceptionnel, passer temporairement le ruleset en **Disabled**, faire l'opération, puis le remettre en **Active**.

✅ **Vérification** : la page **Rulesets** affiche `Gitflow - protected branches` et `Gitflow - branch names`, tous deux **Active**. Un `git push origin main` direct doit maintenant être refusé.

---

## Étape 8 : projet qui a déjà une version

À sauter pour un nouveau projet : sa première version sera `0.1.0`.

Pour qu'un projet existant reparte de sa version actuelle, par exemple `2.3.0` :

1. Onglet **Releases** (ou **Tags**) → **Draft a new release**.
2. **Choose a tag** → taper `v2.3.0` → **Create new tag: v2.3.0 on publish**.
3. **Target** : `main`.
4. Titre : `v2.3.0` → **Publish release**.

La prochaine version sera `2.3.1` (`fix:`), `2.4.0` (`feat:`) ou `3.0.0` (`feat!:` / `BREAKING CHANGE`).

---

## Étape 9 : Dependabot

À sauter si le projet n'utilise pas Dependabot.

Dans `.github/dependabot.yml`, pour **chaque** écosystème, ajouter `target-branch` et `commit-message` :

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    target-branch: dev
    commit-message:
      prefix: "chore(deps)"
```

Sans ça, les pull requests de Dependabot visent `main` et leurs messages sont refusés par la CI.

---

## Étape 10 : tester toute la chaîne

### 10.1 Une pull request de fonctionnalité

```bash
git switch dev && git pull && git switch -c feature/test-ci
```

Faire une petite modification, puis :

```bash
git commit -am "docs: test the CI" && git push -u origin feature/test-ci
```

1. Ouvrir une pull request **`feature/test-ci` → `dev`**.
2. Attendre les vérifications **Gitflow / Checks** et **Quality** : elles doivent passer au vert.
3. **Merge pull request** (bouton « Create a merge commit »).

### 10.2 Une release candidate

1. Onglet **Actions** → workflow **CI** à gauche.
2. **Run workflow** → branche **`dev`** → **Run workflow**.
3. Résultat attendu :
   - une branche `release/vX.Y.Z` ;
   - une pre-release `vX.Y.Z-rc.1` dans **Releases** ;
   - une pull request `release/vX.Y.Z` → `main`, dont les vérifications démarrent toutes seules (grâce à `GITFLOW_TOKEN`).

### 10.3 La version finale

1. Merger la pull request de release dans `main`.
2. Résultat attendu :
   - une release `vX.Y.Z` dans **Releases** ;
   - l'image / le paquet / les fichiers publiés ;
   - une pull request de back-merge `main` → `dev`.
3. Merger cette pull request de back-merge.

✅ **C'est terminé** : le dépôt est entièrement branché sur la CI. Le fonctionnement au quotidien est décrit dans [gitflow/README.md → Au quotidien](gitflow/README.md#au-quotidien).

---

## En cas de problème

| Symptôme | Solution |
|---|---|
| PR bloquée sur « Expected — Waiting for status to be reported » | PR ouverte par la CI sans `GITFLOW_TOKEN` : fermer puis rouvrir la PR, et ajouter le secret (étape 5). Sinon, vérifier que le job du `ci.yml` s'appelle bien `ci`. |
| Le bouton **Run workflow** n'apparaît pas | `ci.yml` doit exister sur la branche par défaut du dépôt (`main`). |
| « Message de commit invalide » | Réécrire les messages au format `type: description` (`feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`…), puis `git push --force-with-lease`. |
| `git push` refusé sur une nouvelle branche | Son nom n'est pas dans le git flow (étape 7.2) : la renommer en `feature/…`, `fix/…`, etc. |
| « Projet non reconnu » / « Type de projet ambigu » | Revoir le nom du dépôt et les fichiers à la racine (étape 1). |
| Job **Quality** en échec sur un script npm | Ajouter le script manquant dans `package.json` (étape 2). |
| « main non mergée dans dev » | Merger d'abord la PR de back-merge `main` → `dev`. |
| La CI ne trouve pas `FloRobart/github-ci` | Dépôt Github-ci privé non partagé (étape 0.1). |
| Un store ou Docker Hub est « ignoré » | Le secret correspondant manque ou est mal nommé (étape 6). |

Liste complète : [gitflow/README.md → Dépannage](gitflow/README.md#dépannage).

---

## Check-list récapitulative

À cocher pour chaque nouveau dépôt :

- [ ] **0** — Github-ci accessible (une seule fois)
- [ ] **1** — Nom du dépôt avec le bon suffixe
- [ ] **2** — Prérequis du type en place, vérifications locales au vert
- [ ] **3** — `.github/workflows/ci.yml` poussé sur `main`, branche `dev` créée
- [ ] **4.1** — Merge commits uniquement + suppression auto des branches
- [ ] **4.2** — Actions autorisées à créer des pull requests
- [ ] **5** — Secret `GITFLOW_TOKEN`
- [ ] **6** — Secrets du type (Docker Hub, npm, Android, Google Play, pub.dev, Chrome, Firefox) si besoin
- [ ] **7.1** — Ruleset `protected-branches.json` importé et actif
- [ ] **7.2** — Ruleset `branch-names.json` importé et actif
- [ ] **8** — Tag de la version actuelle (projet existant uniquement)
- [ ] **9** — Dependabot vers `dev` avec `chore(deps)` (si utilisé)
- [ ] **10** — PR de test, release candidate, version finale et back-merge réussis
