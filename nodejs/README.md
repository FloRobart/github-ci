# Node.js

La CI d'un projet Node.js, git flow compris : une application (API TypeScript, service…) publiée en image Docker, ou une librairie publiée en paquet npm.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité |
| Bouton **Run workflow** | Qualité, puis release candidate (image Docker ou paquet npm + pre-release) |
| Merge sur `main` | Qualité, puis version finale (image Docker ou paquet npm + release) |

Le workflow est [.github/workflows/nodejs.yml](../.github/workflows/nodejs.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

## Application ou librairie

Un projet Node.js a un `package.json` à la racine, sans `pubspec.yaml`. Le reste se lit dans le nom du dépôt et le `Dockerfile` :

| Nom du dépôt | Dockerfile | Type | Publié |
|---|---|---|---|
| `mon-projet-lib` | Interdit | Librairie | Paquet npm |
| `mon-projet-app` ou sans suffixe | Présent | Application | Image Docker |
| `mon-projet-app` | Absent | Refusé (« Dockerfile manquant ») | — |
| Sans suffixe | Absent | Refusé (« Type de projet ambigu ») | — |

Un projet avec un `Dockerfile` qui dépend d'`astro` est un site [Astro](../astro/README.md), et un `…-extension` une [extension navigateur](../extension/README.md) : ils ont leur propre CI. Toutes les règles sont dans [gitflow/README.md → Type de projet](../gitflow/README.md#type-de-projet).

## Prérequis du projet

- **npm** et un `package-lock.json` commité. La CI installe avec `npm ci`, qui reproduit exactement les versions du lockfile.
- Les scripts npm suivants dans `package.json`. La CI échoue si l'un d'eux manque : un contrôle absent doit être un choix visible, pas un oubli.

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

  Les commandes sont des exemples. Un projet sans tests écrit `"test": "echo 'Aucun test'"`, pour que l'absence soit explicite.

  `format:check` ne fait que vérifier : la CI ne modifie jamais le code. Pour corriger, ajouter par exemple `"format": "prettier --write ."` et le lancer en local.

### Application

- Un `Dockerfile` à la racine. Il reçoit la version dans l'argument de build `APP_VERSION` (facultatif) :

  ```dockerfile
  ARG APP_VERSION=dev
  ENV APP_VERSION=${APP_VERSION}
  ```

### Librairie

- Pas de `Dockerfile`.
- Un script `build` dans `package.json`, lancé par la qualité puis juste avant la publication, par exemple `"build": "tsc"`.
- Un nom scopé au propriétaire du dépôt, en minuscules : `@florobart/mon-projet`. GitHub Packages refuse tout autre nom.
- Les champs habituels d'un paquet : `main` ou `exports`, `types`, `files` (ce qui part dans le paquet), et `repository`, qui relie le paquet au dépôt sur GitHub.
- La version de `package.json` n'a pas d'importance : la CI la remplace par la version calculée, sans rien commiter.

## Installation

Le plus simple : le `ci.yml` commun à tous les projets, qui détecte un projet Node.js tout seul. Voir [auto/README.md](../auto/README.md).

Pour appeler directement cette CI :

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Faire les réglages du dépôt, avec le ruleset `protected-branches-type-ci.json` : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/nodejs.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : le ruleset attend les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

Le fichier d'exemple donne la permission `id-token: write`. Elle sert au trusted publishing npm d'une librairie, mais **tout projet Node.js doit l'avoir**, application comprise : GitHub refuse de lancer le workflow si la permission demandée par le job `npm package` n'est pas accordée par le `ci.yml`, même quand ce job ne tourne pas.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `node-version` | `24` | Version de Node.js utilisée par la qualité |

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/nodejs.yml@main
    secrets: inherit
    with:
      node-version: '22'
```

## Le job qualité

Le même pour une application et une librairie, au build près, sur chaque pull request et avant chaque publication :

1. `npm ci`
2. `npm run lint`
3. `npm run format:check`
4. `npm run typecheck`
5. `npm test`
6. Le build de ce que la release publie, sans le publier :
   - application : l'image Docker, construite depuis le `Dockerfile` mais jamais poussée ;
   - librairie : `npm run build`.

Un `Dockerfile` ou un build cassé est donc vu dans la pull request, et pas au moment de la release.

## Le paquet npm

### Où il est publié

| Registre | Quand | Authentification |
|---|---|---|
| GitHub Packages (`npm.pkg.github.com`) | Toujours | Le jeton de la CI, rien à configurer |
| npmjs.com | Seulement si le dépôt est **public** : le code d'un dépôt privé ne part jamais sur le registre public | Trusted publishing, ou le secret `NPM_TOKEN` |

| | Release candidate | Version finale |
|---|---|---|
| Version | `1.5.0-rc.2` | `1.5.0` |
| Tag npm | `next` | `latest` |

Un `npm install @florobart/mon-projet` installe donc toujours la dernière version finale, jamais une release candidate. Pour essayer une release candidate : `npm install @florobart/mon-projet@next`.

Chaque registre qui a déjà la version est ignoré : un run en échec peut être relancé sans rien dupliquer.

### Configurer npmjs.com, une fois par paquet

npmjs.com ne permet de configurer la publication automatique que sur un paquet qui existe déjà :

1. Le scope `@florobart` doit t'appartenir sur npmjs.com : c'est le cas si ton nom d'utilisateur npm est `florobart`, sinon créer une organisation de ce nom (gratuite pour des paquets publics).
2. Publier la première version à la main, depuis le poste : `npm publish --access public`.
3. Sur npmjs.com → le paquet → Settings → **Trusted publishing** → GitHub Actions :

   | Champ | Valeur |
   |---|---|
   | Organization or user | `FloRobart` |
   | Repository | Le nom du dépôt, par exemple `mon-projet-lib` |
   | Workflow filename | `ci.yml` : c'est le workflow **du projet** que npm vérifie, pas celui de ce dépôt |
   | Environment | Vide |

Plus aucun token n'est alors nécessaire. À défaut, le secret `NPM_TOKEN` (un *granular access token* en écriture) fonctionne aussi, mais npm limite sa durée de vie à 90 jours : il faut le renouveler.

### Installer le paquet depuis GitHub Packages

GitHub Packages demande un token même pour un paquet public. Dans le projet qui l'utilise, un `.npmrc` :

```text
@florobart:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Pour un paquet public, npmjs.com est plus simple : aucune configuration.
