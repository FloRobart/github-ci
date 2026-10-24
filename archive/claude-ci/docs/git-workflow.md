# Le Git workflow au quotidien

Ce document décrit ce que tu fais, ce que le pipeline fait à ta place, et quoi faire quand il refuse quelque chose.

## Les règles

1. `main` est la production. On n'y pousse jamais directement, et seules les branches `release/x.y.z` et `hotfix/x.y.z` peuvent y être mergées.
2. `develop` est la branche d'intégration. On n'y pousse jamais directement, mais n'importe quelle branche peut y être mergée par pull request.
3. Chaque titre de pull request respecte [Conventional Commits](https://www.conventionalcommits.org/fr/) : `type(scope optionnel): description`.
4. Les numéros de version ne se modifient jamais à la main : le pipeline les calcule et les écrit.

Ces règles sont imposées de deux façons qui se complètent : les *rulesets* GitHub bloquent les pushs directs, et la vérification **Policy / Git workflow** bloque les pull requests non conformes.

## Développer une fonctionnalité ou un correctif

1. Crée ta branche à partir de `develop` (le nom est libre).
2. Ouvre une pull request vers `develop` avec un titre conforme, par exemple `feat(budget): ajouter l'export CSV`.
3. Deux vérifications tournent : **Policy / Git workflow** (titre et branches) et **Quality / Checks** (build, lint, tests).
4. Merge en **Squash and merge**.

Le type du titre décide de la prochaine version : choisis-le avec soin.

| Type | Usage | Effet sur la version |
|---|---|---|
| `feat` | Nouvelle fonctionnalité | Mineure |
| `fix` | Correction de bug | Correctif |
| `perf` | Amélioration de performance | Correctif |
| `refactor`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert` | Tout le reste | Correctif |
| N'importe lequel suivi de `!` | Changement cassant | Majeure |

## Publier une nouvelle version

1. Onglet **Actions** → **Start release** → **Run workflow**. Laisse `auto`, sauf si tu veux forcer la montée de version.
2. Le pipeline calcule la version, crée `release/x.y.z` à partir de `develop`, y écrit la version et ouvre la pull request vers `main`. Cette pull request liste tout ce que contient la version.
3. Si tu veux tester avant de publier, lance une [release candidate](#tester-avec-une-release-candidate).
4. Si un correctif est nécessaire, ouvre une pull request vers `release/x.y.z`.
5. Merge la pull request de release en **Create a merge commit** (seule méthode proposée).

Au merge, le workflow **Release** enchaîne tout seul :

- création du tag `vX.Y.Z` et de la GitHub Release, avec la liste des changements ;
- suppression de la branche `release/x.y.z` ;
- publication des artefacts : images Docker `x.y.z` et `latest`, ou archives de l'extension ;
- ouverture d'une pull request de back-merge vers `develop`, mergée automatiquement dès que ses vérifications passent.

Il te reste à déployer la nouvelle image sur ton serveur, quand tu le décides.

## Tester avec une release candidate

Une release candidate est une version de test d'une branche `release/x.y.z` ou `hotfix/x.y.z`.

1. Onglet **Actions** → **Release candidate** → **Run workflow**.
2. Dans le menu **Use workflow from**, choisis la branche `release/x.y.z` ou `hotfix/x.y.z`.

Le pipeline publie `vX.Y.Z-rc.1` en pre-release GitHub, avec ses artefacts (image Docker `x.y.z-rc.1`, ou archives de l'extension). Le tag `latest` n'est jamais déplacé et rien n'est envoyé aux stores.

Chaque nouveau lancement après un nouveau commit produit `rc.2`, `rc.3`, etc. Relancer sans nouveau commit réutilise la candidate existante.

## Corriger la production en urgence

1. Onglet **Actions** → **Start hotfix** → **Run workflow**.
2. Le pipeline crée `hotfix/x.y.z` à partir de `main`, avec une montée de correctif, et ouvre la pull request vers `main`.
3. Pousse ton correctif sur `hotfix/x.y.z` : commit direct, ou pull request vers cette branche.
4. Optionnel : lance une release candidate sur cette branche.
5. Merge la pull request en **Create a merge commit**.

La suite est identique à une release : tag, GitHub Release, artefacts, back-merge vers `develop`.

### Hotfix pendant qu'une release est en préparation

C'est le cas délicat de tout Git workflow : les deux branches modifient le numéro de version. Le pipeline le traite seul. Après la publication du hotfix, il merge `main` dans la branche `release/x.y.z` ouverte, en conservant la version de la release, et sa pull request reste mergeable.

Deux situations demandent ton intervention ; le pipeline te les signale avec les commandes à lancer :

- le hotfix et la release modifient les mêmes lignes de code : conflit à résoudre à la main sur la branche de release ;
- la release en préparation n'était qu'une montée de correctif et le hotfix a pris son numéro : la release doit être recréée avec **Start release**.

Un hotfix se termine avant la release suivante : si une release est publiée pendant qu'un hotfix est ouvert, la version du hotfix devient trop ancienne et il doit être recréé avec **Start hotfix**.

## Le back-merge

Après chaque publication, `develop` doit recevoir ce qui est arrivé sur `main` : le numéro de version, les correctifs faits sur la branche de release, le hotfix.

Le pipeline ouvre une pull request `back-merge/vX.Y.Z` → `develop` et demande à GitHub de la merger dès que ses vérifications réussissent. La plupart du temps, tu n'as rien à faire.

- **Conflit** : résous-le sur la branche `back-merge/vX.Y.Z` (éditeur de conflits de GitHub ou en local). Le merge automatique reprend ensuite.
- **Merge manuel** : toujours en **Create a merge commit**, jamais en squash. Un squash couperait le lien entre `develop` et l'historique de `main`.

Tant que le back-merge n'est pas mergé, **Start release** refuse de démarrer : c'est voulu, une release partie d'un `develop` en retard entrerait en conflit avec la production.

## Quand le pipeline refuse

Chaque refus s'affiche en haut de la page du workflow, avec la cause et la marche à suivre.

| Message | Cause | Que faire |
|---|---|---|
| Titre de pull request invalide | Le titre ne respecte pas Conventional Commits | Corrige le titre : la vérification se relance seule |
| Pull request refusée vers « main » | La branche source n'est ni `release/x.y.z` ni `hotfix/x.y.z` | Change la branche cible vers `develop`, ou passe par **Start release** / **Start hotfix** |
| La version du projet ne correspond pas à la branche | Le numéro de version a été modifié à la main | Supprime la branche et relance **Start release** / **Start hotfix** |
| La version x.y.z est déjà publiée | Le tag existe déjà | Supprime la branche et relance le bouton de démarrage |
| Une branche release est déjà en cours | Une seule release à la fois | Termine la release en cours, ou supprime sa branche |
| « develop » n'est pas à jour avec « main » | Un back-merge n'est pas encore mergé | Merge la pull request `back-merge/…` |
| Rien à publier | `develop` ne contient rien de nouveau | Merge au moins une pull request dans `develop` |
| Release candidate impossible depuis cette branche | Le workflow n'a pas été lancé sur une branche release ou hotfix | Relance en choisissant la branche dans **Use workflow from** |
| Identifiants de la GitHub App manquants | Variable ou secret absent du dépôt | Voir [installation.md](installation.md) |
| Back-merge à terminer manuellement | L'option **Allow auto-merge** du dépôt est désactivée | Active-la, ou merge la pull request en merge commit |

## Limites connues

- Une seule release et un seul hotfix peuvent être en cours en même temps.
- Les pull requests mergées avant la mise en place du pipeline, avec un titre libre, comptent pour une montée de correctif.
- Le calcul de version examine les 1000 pull requests les plus récentes du dépôt.
