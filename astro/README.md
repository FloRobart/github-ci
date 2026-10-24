# Astro

La CI d'un site Astro, git flow compris.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité |
| Bouton **Run workflow** | Qualité, puis release candidate (image Docker + pre-release) |
| Merge sur `main` | Qualité, puis version finale (image Docker + release) |

Le workflow est [.github/workflows/astro.yml](../.github/workflows/astro.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

**Différence avec Node.js :** le site est aussi construit pendant la qualité. `astro build` trouve des erreurs qu'`astro check` ne voit pas (collections de contenu invalides, page qui plante au rendu), et il vaut mieux les voir dans la pull request qu'au moment de la release.

## Prérequis du projet

- **npm** et un `package-lock.json` commité. La CI installe avec `npm ci`.
- Les scripts npm suivants dans `package.json`. La CI échoue si l'un d'eux manque :

  ```json
  {
    "scripts": {
      "lint": "eslint .",
      "typecheck": "astro check",
      "test": "vitest run",
      "build": "astro build"
    }
  }
  ```

  `typecheck` porte le même nom que pour Node.js : une seule convention pour tous les projets JavaScript. `astro check` demande le paquet `@astrojs/check` en dépendance de développement. Un site sans tests écrit `"test": "echo 'Aucun test'"`.

- Un `Dockerfile` à la racine qui construit et sert le site, par exemple un build Node.js puis nginx pour un site statique. Il reçoit la version dans l'argument de build `APP_VERSION` (facultatif).

## Installation

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Faire les réglages du dépôt : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/astro.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : les rulesets attendent les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `node-version` | `24` | Version de Node.js utilisée par la qualité |

## Le job qualité

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
