# Debian

La CI d'un paquet Debian, git flow compris : le paquet est construit en fichier `.deb`, installé puis désinstallé dans un système propre, et attaché à la GitHub Release.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité : construction, installation et désinstallation du paquet |
| Bouton **Run workflow** | Qualité, puis release candidate : `.deb` + pre-release |
| Merge sur `main` | Qualité, puis version finale : `.deb` + release |

Le workflow est [.github/workflows/debian.yml](../.github/workflows/debian.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

Une **application Flutter** peut aussi publier un paquet Debian, à côté de son APK : voir [flutter/README.md → Debian](../flutter/README.md#debian). Les règles du paquet décrites ici s'appliquent aussi à elle.

## Reconnaître un paquet Debian

Un paquet Debian est un dépôt qui a un fichier **`DEBIAN/control`** à la racine (`DEBIAN` en majuscules), sans `pubspec.yaml`. Le suffixe du nom ne compte pas, et un `package.json` ou un `Dockerfile` à côté, pour les outils, sont ignorés.

| Cas | Résultat |
|---|---|
| `DEBIAN/control` | Paquet Debian |
| `DEBIAN/control` + `pubspec.yaml` | Application Flutter, qui publie aussi son paquet Debian |
| Un dossier `DEBIAN/` sans `control` | « DEBIAN/control manquant » |
| `debian/control` en minuscules | « Paquet source Debian » : voir plus bas |
| `…-database` avec un `DEBIAN/control` | Migrations de base de données : le suffixe passe avant |

Toutes les règles sont dans [gitflow/README.md → Type de projet](../gitflow/README.md#type-de-projet).

**Paquet source** : un dossier `debian/` en minuscules (`debian/control`, `debian/rules`, `debian/changelog`…) est le format des paquets sources de Debian, construits avec `dpkg-buildpackage`, en général pour compiler du code. La CI ne le gère pas : elle construit les paquets dont le dépôt contient déjà tous les fichiers à installer.

## Prérequis du projet

La racine du dépôt **est** l'arborescence du paquet, telle qu'elle sera installée sur le système. Il ne reste plus qu'à la mettre en archive :

```text
mon-paquet/
├── DEBIAN/
│   ├── control             ← obligatoire : décrit le paquet
│   ├── postinst            ← facultatif : scripts lancés par dpkg
│   └── conffiles           ← facultatif : complété par la CI
├── usr/
│   ├── bin/mon-paquet      ← installé dans /usr/bin/mon-paquet
│   └── share/doc/mon-paquet/copyright
├── etc/mon-paquet/mon-paquet.conf
├── README.md               ← pas dans le paquet
└── .github/workflows/ci.yml
```

Seuls `DEBIAN/` et les dossiers **`etc/`, `opt/`, `srv/`, `usr/` et `var/`** vont dans le paquet. Le reste du dépôt (README, `.github/`, tests, scripts de développement…) n'y entre pas.

Les dossiers `bin/`, `sbin/` et `lib*/` à la racine font échouer la CI. Sur Debian et Ubuntu, `/bin`, `/sbin` et `/lib` ne sont plus que des liens vers `/usr/bin`, `/usr/sbin` et `/usr/lib` (« merged /usr ») : un paquet doit installer ses fichiers dans `usr/`. Un projet Flutter n'est pas concerné : son `lib/` contient les sources Dart, et reste hors du paquet.

### DEBIAN/control

```text
Package: mon-paquet
Version: 1.0.0
Architecture: all
Maintainer: Prénom Nom <adresse@exemple.fr>
Depends: bash, curl
Section: utils
Priority: optional
Description: Résumé en une ligne
 Description longue, sur une ou plusieurs lignes qui commencent
 toutes par une espace.
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `Package` | Oui | Nom du paquet : minuscules, chiffres, `+`, `-` et `.` |
| `Version` | Oui | Écrite par la CI à chaque release (voir [La version](#la-version)). Mettre `1.0.0` au départ. |
| `Architecture` | Oui | `all` pour des scripts ou des fichiers, `amd64` pour un binaire compilé |
| `Maintainer` | Oui | `Nom <adresse>` |
| `Description` | Oui | Une ligne de résumé, puis la description longue, chaque ligne commençant par une espace |
| `Depends` | Non | Les paquets nécessaires, séparés par des virgules. La CI vérifie qu'ils suffisent : voir [Le job qualité](#le-job-qualité). |

La CI échoue en nommant chaque champ obligatoire qui manque.

### Ce que la CI ajoute

Avant de construire l'archive, la CI complète une copie de l'arborescence, comme le fait l'outillage de Debian (debhelper). Le dépôt n'a rien à écrire de tout ça :

| Ajout | Détail |
|---|---|
| `Installed-Size` | Taille des fichiers installés, affichée par apt |
| `DEBIAN/md5sums` | Sommes de contrôle des fichiers installés, vérifiées par `dpkg --verify`. Toujours recalculé. |
| `DEBIAN/conffiles` | Chaque fichier de `etc/`, si le dépôt ne l'y a pas déjà listé : une mise à jour garde les modifications faites par l'utilisateur, comme pour tout paquet Debian |
| Droits | Fichiers lisibles par tous et modifiables par leur propriétaire seul, exécutables conservés. `DEBIAN/` et les scripts `preinst`, `postinst`, `prerm`, `postrm` et `config` exécutables. Tout appartient à `root` dans l'archive. |
| Compression | xz, que lisent tous les dpkg (celui d'Ubuntu compresse en zstd par défaut) |

Git ne garde que le bit exécutable : marquer exécutables les fichiers de `usr/bin/` avec `git update-index --chmod=+x usr/bin/mon-paquet` si le poste ne le fait pas.

## Installation

Le plus simple : le `ci.yml` commun à tous les projets, qui détecte un paquet Debian tout seul. Voir [auto/README.md](../auto/README.md).

Pour appeler directement cette CI :

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Faire les réglages du dépôt, avec le ruleset `protected-branches-type-ci.json` : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/github-ci/.github/workflows/debian.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : le ruleset attend les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

Aucun secret n'est nécessaire.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `debian-image` | `debian:12` | Image Docker dans laquelle le paquet est installé pour être testé, par exemple `debian:13` ou `ubuntu:24.04`. Choisir le plus ancien système sur lequel le paquet doit s'installer. |

```yaml
jobs:
  ci:
    uses: FloRobart/github-ci/.github/workflows/debian.yml@main
    secrets: inherit
    with:
      debian-image: 'ubuntu:24.04'
```

## Le job qualité

La qualité fait exactement ce que fait la release, avec la version de `DEBIAN/control`, sans rien publier :

1. Construction du `.deb` (voir [Ce que la CI ajoute](#ce-que-la-ci-ajoute)). `dpkg-deb` refuse un `DEBIAN/control` invalide, par exemple une version mal écrite.
2. **Installation dans un système propre** : un conteneur neuf de l'image `debian-image`, qui n'a que le système de base. Dans l'ordre :
   1. `apt` installe le paquet et ses `Depends`, puis lance `preinst` et `postinst` ;
   2. chaque exécutable du paquet doit trouver ses bibliothèques partagées (`ldd`). Une bibliothèque introuvable veut dire qu'il manque un paquet dans `Depends`, ou que le binaire a été compilé pour un système plus récent que `debian-image` ;
   3. `apt` purge le paquet, puis lance `prerm` et `postrm`.
3. **Fichiers `.desktop`** de `usr/share/applications/`, vérifiés par `desktop-file-validate` : une erreur fait échouer la CI.
4. **lintian**, le contrôleur des paquets de Debian, dont les remarques sont seulement affichées dans le résumé du run. Il applique les règles de l'archive officielle de Debian, dont certaines ne concernent pas un paquet publié sur GitHub. Par exemple :
   - `no-copyright-file` : ajouter `usr/share/doc/<paquet>/copyright` ;
   - `no-changelog` : ajouter `usr/share/doc/<paquet>/changelog.gz` ;
   - `dir-or-file-in-opt` : l'archive de Debian n'installe rien dans `/opt`, un paquet tiers si.

Un échec de l'étape 1, 2 ou 3 bloque la pull request.

## La version

`DEBIAN/control` suit les versions publiées, comme le `package.json` et le `pubspec.yaml` : la CI écrit `Version: X.Y.Z` sur la branche de release ou de hotfix, et une pull request vers `main` est bloquée tant qu'il ne porte pas la bonne version (voir [gitflow/README.md → Les fichiers de version](../gitflow/README.md#les-fichiers-de-version)).

| | Release candidate | Version finale |
|---|---|---|
| `Version` dans le `.deb` | `1.5.0~rc.2` | `1.5.0` |
| Fichier attaché à la release | `<nom>-v1.5.0-rc.2.deb` | `<nom>-v1.5.0.deb` |

Le `-rc.N` d'une release candidate devient `~rc.N` dans le paquet. Pour dpkg, un `-` sépare la révision Debian : `1.5.0-rc.2` passerait **après** `1.5.0`, et la version finale ne s'installerait pas par-dessus. Le `~` place au contraire la release candidate **avant** `1.5.0`.

Le nom du fichier vient du nom du dépôt (voir [gitflow/README.md → Ce qui est publié](../gitflow/README.md#ce-qui-est-publié)), pas du champ `Package`.

## Installer le paquet publié

Depuis la page de la GitHub Release, ou en ligne de commande :

```bash
curl --location --remote-name https://github.com/FloRobart/<dépôt>/releases/download/v1.5.0/<nom>-v1.5.0.deb
```

```bash
sudo apt install ./<nom>-v1.5.0.deb
```

`apt install ./fichier.deb` installe aussi les paquets de `Depends`, contrairement à `dpkg -i`. Les mises à jour se font de la même façon : il n'y a pas de dépôt APT, donc pas de mise à jour automatique avec `apt upgrade`.
