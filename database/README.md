# Database

La CI d'un projet de base de données : les migrations du schéma, publiées en image Docker, git flow compris.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité (migrations testées sur une base vide) |
| Bouton **Run workflow** | Qualité, puis release candidate (image de migrations + pre-release) |
| Merge sur `main` | Qualité, puis version finale (image de migrations + release) |

Le workflow est [.github/workflows/database.yml](../.github/workflows/database.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

Un projet de base de données est un dépôt dont le nom se termine par `-database` et qui a un `Dockerfile`. Le suffixe passe avant tout le reste : un `package.json` pour les outils (husky, commitlint…) ne change rien. Toutes les règles sont dans [gitflow/README.md → Type de projet](../gitflow/README.md#type-de-projet).

## L'image publiée

L'image contient [dbmate](https://github.com/amacneil/dbmate) et toutes les migrations. Au démarrage, elle applique les migrations en attente, puis s'arrête. La base elle-même tourne sur l'image officielle `postgres`.

**Son nom ne reprend pas celui du dépôt :** le suffixe `-database` devient `-migrations`, puisque l'image contient les migrations et pas la base.

| | Release candidate | Version finale |
|---|---|---|
| Image GHCR | `ghcr.io/<owner>/econoris-migrations:1.5.0-rc.2` | `ghcr.io/<owner>/econoris-migrations:1.5.0` et `:latest` |
| Image Docker Hub | `<utilisateur>/econoris-migrations:1.5.0-rc.2` | `<utilisateur>/econoris-migrations:1.5.0` et `:latest` |

Exemple pour le dépôt `econoris-database`. L'image Docker Hub n'est publiée que si les secrets `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN` existent.

## Prérequis du projet

- Les migrations dans `db/migrations/`, un fichier `.sql` par migration, avec une section `-- migrate:up` **et** une section `-- migrate:down`. C'est le dossier par défaut de dbmate.
- Un `Dockerfile` à la racine, basé sur l'image de dbmate, dont la commande par défaut applique les migrations :

  ```dockerfile
  FROM ghcr.io/amacneil/dbmate:2.36.0

  COPY ./db/migrations /db/migrations

  CMD ["--wait", "--no-dump-schema", "up"]
  ```

  L'entrypoint doit rester `dbmate` : la qualité lance l'image avec d'autres arguments (`--no-dump-schema rollback`) pour tester les sections `down`. L'image reçoit l'adresse de la base dans la variable `DATABASE_URL`.

- Un `.dockerignore` qui ne garde que `db/migrations`, pour que l'image ne contienne rien d'autre :

  ```text
  *
  !db/migrations
  ```

## Installation

Le plus simple : le `ci.yml` commun à tous les projets, qui détecte un projet de base de données tout seul. Voir [auto/README.md](../auto/README.md).

Pour appeler directement cette CI :

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Faire les réglages du dépôt, avec le ruleset `protected-branches-type-ci.json` : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/database.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : le ruleset attend les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

Un ancien workflow qui publie l'image au push d'un tag `v*` est à supprimer : la CI pousse elle-même ces tags, l'image serait publiée deux fois.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `postgres-version` | `18` | Version de PostgreSQL sur laquelle les migrations sont testées. Garder la même qu'en production. |

## Le job qualité

Une base PostgreSQL vide est démarrée pour le job, puis :

1. L'image est construite depuis le `Dockerfile`, chargée en local mais jamais poussée.
2. Elle est lancée une première fois : toutes les migrations sont appliquées sur la base vide.
3. Elle est relancée : il n'y a plus rien à appliquer, elle doit réussir sans rien faire, comme un redéploiement sans nouvelle migration.
4. Toutes les migrations sont annulées, de la plus récente à la plus ancienne : chaque section `down` est testée.
5. Toutes les migrations sont appliquées à nouveau : une section `down` incomplète fait échouer une section `up` sur un objet qui existe encore.

Une migration cassée, ou une section `down` oubliée, est ainsi vue dans la pull request, et pas en production.
