# Extension

La CI d'une extension navigateur, git flow compris : l'extension est vérifiée, construite en archive `.zip` attachée à la GitHub Release, puis envoyée au Chrome Web Store et sur addons.mozilla.org à chaque version finale.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité |
| Bouton **Run workflow** | Qualité, puis release candidate : archive de l'extension + pre-release |
| Merge sur `main` | Qualité, puis version finale : archive + release, puis envoi aux stores |

Le workflow est [.github/workflows/extension.yml](../.github/workflows/extension.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

## Reconnaître une extension

Une extension est un dépôt dont le nom se termine par **`-extension`** et qui a un **`package.json`** à la racine, par exemple `tab-saver-extension`. Sinon, la CI refuse de publier :

| Cas | Résultat |
|---|---|
| `…-extension` avec un `pubspec.yaml` | « Extension Flutter » |
| `…-extension` sans `package.json` ni `pubspec.yaml` | « Projet non reconnu » |
| Un autre type de projet sur ce workflow | « Mauvaise CI de type » |
| `…-extension` sur un autre workflow (`nodejs.yml`…) | « Mauvaise CI de type » |

## Prérequis du projet

- **npm** et un `package-lock.json` commité. La CI installe avec `npm ci`.
- Les scripts npm suivants dans `package.json`. La CI échoue si l'un d'eux manque :

  ```json
  {
    "scripts": {
      "lint": "eslint .",
      "format:check": "prettier --check .",
      "typecheck": "tsc --noEmit",
      "test": "vitest run",
      "build": "vite build"
    }
  }
  ```

  Les commandes sont des exemples. Un projet sans tests écrit `"test": "echo 'Aucun test'"`.

- `npm run build` produit l'extension prête à charger dans `dist/`, avec son `manifest.json` à la racine de ce dossier. Un autre dossier se règle avec le paramètre `distribution-directory`.
- Pour Firefox, l'identifiant de l'extension dans le manifest :

  ```json
  {
    "browser_specific_settings": {
      "gecko": { "id": "tab-saver@florobart.dev" }
    }
  }
  ```

## Installation

Le plus simple : le `ci.yml` commun à tous les projets, qui détecte une extension toute seule. Voir [auto/README.md](../auto/README.md). Configurer ensuite les stores si besoin : voir plus bas.

Pour appeler directement cette CI :

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Faire les réglages du dépôt, avec le ruleset `protected-branches-type-ci.json` : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).
3. Si besoin, configurer les stores : voir plus bas.

```yaml
jobs:
  ci:
    uses: FloRobart/github-ci/.github/workflows/extension.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : le ruleset attend les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `node-version` | `24` | Version de Node.js |
| `distribution-directory` | `dist` | Dossier produit par `npm run build`, qui contient le `manifest.json` |

```yaml
jobs:
  ci:
    uses: FloRobart/github-ci/.github/workflows/extension.yml@main
    secrets: inherit
    with:
      distribution-directory: '.output/chrome-mv3'
```

## Le job qualité

1. `npm ci`
2. `npm run lint`
3. `npm run format:check`
4. `npm run typecheck`
5. `npm test`
6. `npm run build`
7. `web-ext lint` sur le dossier construit : le validateur d'addons.mozilla.org (manifest invalide, code interdit, fichier manquant). Ses avertissements s'affichent sans bloquer.

Comme pour Astro, l'extension est construite dès la pull request : un build cassé doit se voir avant la release.

## La version

La version du `manifest.json` commité n'a pas d'importance. La CI écrit la version calculée dans le `package.json` avant le build (certains outils, comme WXT, la recopient dans le manifest), puis dans le `manifest.json` construit :

| | Release candidate | Version finale |
|---|---|---|
| `version` | `1.5.0` | `1.5.0` |
| `version_name` (affichée) | `1.5.0-rc.2` | `1.5.0` |
| Archive attachée à la release | `<nom>-v1.5.0-rc.2.zip` | `<nom>-v1.5.0.zip` |
| Envoyée aux stores | Non | Oui |

Les stores n'acceptent que des chiffres dans `version` : le suffixe `-rc.N` va dans `version_name`. Une release candidate n'est jamais envoyée aux stores : elle s'essaie en chargeant l'archive dézippée en mode développeur (`chrome://extensions` → Charger l'extension non empaquetée, ou `about:debugging` dans Firefox).

## Les stores

Chaque store est ignoré, avec un message, tant que ses secrets n'existent pas : un projet peut sortir ses versions sur GitHub bien avant d'avoir ses comptes de store.

Les envois ont lieu **après** la GitHub Release : un store qui refuse la version ne bloque ni le tag ni le back-merge. Chaque store est un job à part, donc **Re-run failed jobs** ne renvoie la version qu'au store en échec. Un envoi réussi veut dire *soumis* : la version n'est visible des utilisateurs qu'après la validation de Google ou de Mozilla.

La première version se publie à la main sur chaque store : la CI ne fait que des mises à jour d'une extension qui existe déjà.

### Chrome Web Store

Secrets du dépôt (Settings → Secrets and variables → Actions), tous obligatoires pour l'envoi :

| Secret | Où le trouver |
|---|---|
| `CHROME_EXTENSION_ID` | L'identifiant de l'extension, dans son URL sur le Chrome Web Store ou la console développeur |
| `CHROME_PUBLISHER_ID` | Console développeur du Chrome Web Store → compte |
| `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` | Un client OAuth de Google Cloud, avec l'API Chrome Web Store activée |
| `CHROME_REFRESH_TOKEN` | Généré pour ce client OAuth |

Le guide pas à pas de ces identifiants est celui de l'outil utilisé : [chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys).

### addons.mozilla.org

| Secret | Où le trouver |
|---|---|
| `FIREFOX_API_KEY` | addons.mozilla.org → Outils → Gérer les clés d'API → *JWT issuer* |
| `FIREFOX_API_SECRET` | Même page → *JWT secret* |

La version est envoyée sur le canal **listed** (publique sur addons.mozilla.org), avec une archive des sources du dépôt : Mozilla l'exige pour relire un code minifié ou assemblé par un bundler.
