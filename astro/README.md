# Astro

La CI d'un site Astro, git flow compris.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité |
| Bouton **Run workflow** | Qualité, puis release candidate (image Docker + pre-release) |
| Merge sur `main` | Qualité, puis version finale (image Docker + release) |

Le workflow est [.github/workflows/astro.yml](../.github/workflows/astro.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

Un site Astro est un projet avec un `package.json` qui a `astro` dans ses `dependencies` ou ses `devDependencies`, et un `Dockerfile`. Toutes les règles sont dans [gitflow/README.md → Type de projet](../gitflow/README.md#type-de-projet).

**Le site est aussi construit pendant la qualité :** `astro build` trouve des erreurs qu'`astro check` ne voit pas (collections de contenu invalides, page qui plante au rendu), et il vaut mieux les voir dans la pull request qu'au moment de la release.

## Prérequis du projet

- **npm** et un `package-lock.json` commité. La CI installe avec `npm ci`.
- Les scripts npm suivants dans `package.json`. La CI échoue si l'un d'eux manque :

  ```json
  {
    "scripts": {
      "lint": "eslint .",
      "format:check": "prettier --check .",
      "typecheck": "astro check",
      "test": "vitest run",
      "build": "astro build"
    }
  }
  ```

  `typecheck` porte le même nom que pour Node.js : une seule convention pour tous les projets JavaScript. `astro check` demande le paquet `@astrojs/check` en dépendance de développement. Un site sans tests écrit `"test": "echo 'Aucun test'"`.

  `format:check` ne fait que vérifier : la CI ne modifie jamais le code. Pour corriger, ajouter par exemple `"format": "prettier --write ."` et le lancer en local. Prettier formate les fichiers `.astro` avec le plugin `prettier-plugin-astro`.

- Un `Dockerfile` à la racine qui construit et sert le site, par exemple un build Node.js puis nginx pour un site statique. Il reçoit la version dans l'argument de build `APP_VERSION` (facultatif).

## Installation

Le plus simple : le `ci.yml` commun à tous les projets, qui détecte un projet Astro tout seul. Voir [auto/README.md](../auto/README.md).

Pour appeler directement cette CI :

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Faire les réglages du dépôt, avec le ruleset `protected-branches-type-ci.json` : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/astro.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : le ruleset attend les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `node-version` | `24` | Version de Node.js utilisée par la qualité |

## Le job qualité

1. `npm ci`
2. `npm run lint`
3. `npm run format:check`
4. `npm run typecheck`
5. `npm test`
6. `npm run build`
7. L'image Docker, construite depuis le `Dockerfile` mais jamais poussée : un `Dockerfile` cassé est vu dans la pull request, et pas au moment de la release.
