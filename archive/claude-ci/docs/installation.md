# Installation

Deux étapes sont à faire une seule fois, puis cinq étapes par projet.

## Une seule fois

### 1. Publier ce dépôt

Les projets appellent ce dépôt par son nom, `FloRobart/github-ci`, et par le tag `v1`. Il doit être **public** : un dépôt public ne peut appeler que des workflows publics.

```bash
git init --initial-branch main
```

```bash
git add . && git commit --message "feat: reusable Git workflow pipelines"
```

```bash
gh repo create FloRobart/github-ci --public --source . --push
```

```bash
git tag v1 && git push origin v1
```

Si tu choisis un autre nom de dépôt, remplace `FloRobart/github-ci` dans les fichiers de `templates/`.

### 2. Créer la GitHub App d'automatisation

Le pipeline crée des branches et ouvre des pull requests. Il le fait au nom d'une GitHub App et non avec le jeton par défaut de GitHub Actions : les pull requests ouvertes avec ce jeton ne déclenchent aucun workflow, donc leurs vérifications obligatoires ne tourneraient jamais.

1. GitHub → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**.
2. **GitHub App name** : un nom libre, unique sur GitHub, par exemple `florobart-release-bot`.
3. **Homepage URL** : l'adresse de ce dépôt.
4. **Webhook** : décoche **Active**.
5. **Repository permissions** :

   | Permission | Accès | Pourquoi |
   |---|---|---|
   | Contents | Read and write | Créer les branches, les tags et les GitHub Releases |
   | Pull requests | Read and write | Ouvrir et merger les pull requests |
   | Workflows | Read and write | Pousser une branche qui contient des modifications de fichiers de workflow |
   | Metadata | Read-only | Obligatoire, coché d'office |

6. **Where can this GitHub App be installed?** : **Only on this account**.
7. **Create GitHub App**, puis note le **Client ID** affiché.
8. En bas de la page, **Generate a private key** : un fichier `.pem` est téléchargé. Garde-le en lieu sûr.
9. Menu **Install App** → **Install** → choisis les dépôts des projets concernés.

L'App n'a besoin d'aucun droit de contournement des protections de branches : elle passe par des pull requests, comme toi.

## Pour chaque projet

### 1. Donner les identifiants de l'App au dépôt

Un compte personnel n'a pas de secrets partagés entre dépôts : ils se déclarent dans chaque projet.

```bash
gh variable set AUTOMATION_APP_CLIENT_ID --repo FloRobart/MON_PROJET --body "LE_CLIENT_ID"
```

```bash
gh secret set AUTOMATION_APP_PRIVATE_KEY --repo FloRobart/MON_PROJET < chemin/vers/la-cle.pem
```

Les projets qui publient une image ont aussi besoin des secrets `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN`, déjà présents dans tes dépôts actuels.

### 2. Nommer la branche de production `main`

Le pipeline suppose `main` et `develop`. Plusieurs de tes dépôts utilisent `master` : le plus simple est de renommer la branche dans **Settings** → **General** → **Default branch** (GitHub redirige les anciens liens).

Pour garder `master`, il faut à la place :

- remplacer `main` par `master` sous `on.push.branches` dans `release.yml` ;
- ajouter `production-branch: master` aux appels de `pull-request-policy.yml`, `start-release-or-hotfix.yml` et `back-merge.yml` ;
- passer `master` en deuxième argument du script de l'étape 4.

### 3. Copier les fichiers d'appel

Copie dans `.github/workflows/` du projet les cinq fichiers du modèle adapté, depuis `templates/api-node`, `templates/app-flutter` ou `templates/extension` :

| Fichier | Rôle |
|---|---|
| `pull-request.yml` | Vérifications de chaque pull request |
| `start-release.yml` | Bouton **Start release** |
| `start-hotfix.yml` | Bouton **Start hotfix** |
| `release-candidate.yml` | Bouton **Release candidate** |
| `release.yml` | Publication au merge sur `main` |

Remplace ensuite les valeurs marquées `TODO` (nom de l'image Docker) et supprime les anciens workflows du projet.

Ces fichiers doivent se trouver sur `main` **avant** l'étape suivante : pousse-les directement tant que la branche n'est pas encore protégée. Les boutons n'apparaissent dans l'onglet Actions que pour les workflows présents sur la branche par défaut.

À ce premier push, le workflow **Release** se lance et affiche l'avertissement « Rien à publier : la version existe déjà ». C'est attendu : la version du projet a déjà son tag. Attention, sur un dépôt qui n'a **aucun** tag `vX.Y.Z`, ce premier push publie la version écrite dans les fichiers du projet.

### 4. Protéger les branches

Depuis ce dépôt :

```bash
bash scripts/setup-repository.sh FloRobart/MON_PROJET
```

Le script, relançable sans risque :

- autorise les merges en merge commit et en squash, active l'auto-merge et la suppression automatique des branches mergées ;
- crée `develop` à partir de `main` si elle n'existe pas ;
- applique les deux rulesets de `rulesets/`.

Ce que les rulesets imposent :

| Règle | `main` | `develop` |
|---|---|---|
| Push direct, force push, suppression | Interdits | Interdits |
| Pull request obligatoire | Oui | Oui |
| Méthodes de merge | Merge commit | Squash ou merge commit |
| Vérifications obligatoires | `Policy / Git workflow`, `Quality / Checks` | Les mêmes |
| Branche à jour avec la cible avant merge | Oui | Non |
| Contournement | Personne, administrateur compris | Personne, administrateur compris |

Sans le script, les mêmes réglages se font à la main : importe chaque fichier de `rulesets/` dans **Settings** → **Rules** → **Rulesets** → **New ruleset** → **Import a ruleset**, puis coche **Allow auto-merge** et **Automatically delete head branches** dans **Settings** → **General**.

Conseil : passe `develop` en branche par défaut du dépôt. Les nouvelles pull requests la viseront d'office.

### 5. Vérifier

1. Ouvre une pull request vers `develop` avec un titre libre, par exemple « test » : **Policy / Git workflow** doit échouer en expliquant le format attendu.
2. Corrige le titre en `chore: tester le pipeline` : la vérification passe. Merge.
3. Lance **Start release** : une branche `release/x.y.z` et sa pull request apparaissent.
4. Lance **Release candidate** sur cette branche : une pre-release `vX.Y.Z-rc.1` et ses artefacts sont publiés.
5. Merge la pull request de release : la version est publiée et une pull request de back-merge se merge seule dans `develop`.

## Valeurs pour les projets Econoris

### Econoris_server

- Modèle : `templates/api-node`. Branche de production actuelle : `master`.
- `image-name: econoris-server` dans `release.yml` et `release-candidate.yml`.
- Anciens workflows à supprimer : `check-version-on-pr.yml`, `publish-images.yml`, `release.yml`, `run-tests-on-pr.yml`.
- L'ancien workflow publiait aussi l'image `econoris-db`. Le modèle ne la reprend pas, la base de données étant laissée de côté pour l'instant. Pour continuer à la publier d'ici là, ajoute ce job à `release.yml` :

  ```yaml
  database-image:
    name: Database image
    needs: [release, quality]
    permissions:
      contents: read
      packages: write
    uses: FloRobart/github-ci/.github/workflows/docker-publish.yml@v1
    with:
      image-name: econoris-db
      context: Database
      version: ${{ needs.release.outputs.version }}
      tag-latest: true
    secrets:
      DOCKERHUB_USERNAME: ${{ secrets.DOCKERHUB_USERNAME }}
      DOCKERHUB_TOKEN: ${{ secrets.DOCKERHUB_TOKEN }}
  ```

### econoris_app

- Modèle : `templates/app-flutter`. Branche de production actuelle : `master`.
- `image-name: econoris-app-web` dans `release.yml` et `release-candidate.yml`.
- Le projet n'a pas de dossier `test` : ajoute `test-command: ''` aux trois appels de `flutter-quality.yml`, sinon `flutter test` échoue.
- `flutter analyze` échoue dès la moindre remarque. Si l'analyse n'a jamais été imposée sur ce projet, commence par `analyze-command: flutter analyze --no-fatal-infos --no-fatal-warnings`.
- Anciens workflows à supprimer : `check-version-on-pr.yml`, `publish-images.yml`, `release.yml`.

### econoris-extension

- Modèle : `templates/extension`. Branche de production : `main`, rien à renommer.
- Aucune valeur à adapter : le manifeste est bien à `public/manifest.json` et les variables `PUBLISH_CHROME`, `PUBLISH_FIREFOX`, `CWS_*` ainsi que les secrets `CWS_*` et `AMO_*` gardent les mêmes noms.
- Anciens workflows à supprimer : `check-version-on-pr.yml`, `release.yml`.
- `scripts/sync-manifest-version.mjs` et le script npm `version` ne servent plus au pipeline, qui écrit lui-même la version dans `package.json`, `package-lock.json` et le manifeste.

## Mettre à jour le pipeline

Les projets suivent le tag `v1` : il n'y a rien à modifier chez eux. Après une modification de ce dépôt, déplace le tag comme indiqué dans le [README](../README.md#faire-évoluer-ce-dépôt).

Un changement incompatible, par exemple un paramètre renommé, se publie sous un nouveau tag `v2`. Les projets y passent un par un en changeant `@v1` en `@v2`.
