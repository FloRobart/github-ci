# Flutter

La CI d'un projet Flutter, git flow compris :

- une **application** : la version web en image Docker, l'APK et l'AAB Android en fichiers attachés à la GitHub Release ;
- une **librairie** : rien à construire, le tag git et la GitHub Release sont la publication.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité |
| Bouton **Run workflow** | Qualité, puis release candidate : builds de l'application, pre-release |
| Merge sur `main` | Qualité, puis version finale : builds de l'application, release |

Le workflow est [.github/workflows/flutter.yml](../.github/workflows/flutter.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

## Application ou librairie

Le type se lit dans le nom du dépôt :

| Nom du dépôt | Type | Dockerfile | Publié |
|---|---|---|---|
| `mon-projet-app` | Application | Facultatif : sans lui, pas d'image web (application mobile uniquement) | Image web, APK, AAB |
| `mon-projet-lib` | Librairie | Interdit | Tag et GitHub Release |
| Sans suffixe | Application avec un `Dockerfile`, librairie sans, avec un avertissement | — | Selon le cas |

Un nom sans suffixe reste accepté pour les projets créés avant cette convention, mais une application mobile sans `Dockerfile` y serait prise pour une librairie : la renommer en `-app`.

## Prérequis du projet

- Un dossier `test/` avec au moins un test : `flutter test` échoue sans lui.
- Un code formaté par `dart format` : la qualité refuse un fichier mal formaté.
- Pour l'image web d'une application : un `Dockerfile` à la racine qui construit **lui-même** la version web. [example/Dockerfile](example/Dockerfile) le fait en deux étapes, un build Flutter puis nginx.
- Pour Android, si l'application doit être publiée sur un store : la signature décrite ci-dessous.

## Installation

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Si besoin, copier [example/Dockerfile](example/Dockerfile) à la racine du projet.
3. Faire les réglages du dépôt : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/flutter.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : les rulesets attendent les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `flutter-version` | Dernière stable | Version de Flutter, par exemple `3.35.0`. La fixer rend les builds reproductibles. |
| `docker-image` | `true` | Publie la version web d'une application en image Docker, si elle a un `Dockerfile`. `false` pour ne pas la publier malgré le `Dockerfile`. |
| `android` | `true` | Construit l'APK et l'AAB d'une application et les attache à la release. `false` pour une application uniquement web. |

Une librairie ignore ces deux paramètres : elle n'a ni image ni build Android.

```yaml
jobs:
  ci:
    uses: FloRobart/Github-ci/.github/workflows/flutter.yml@main
    secrets: inherit
    with:
      flutter-version: '3.35.0'
      android: false
```

## Le job qualité

1. `flutter pub get`
2. `dart format --output=none --set-exit-if-changed .`
3. `flutter analyze`
4. `flutter test`

## Librairie

La CI ne publie pas la librairie sur un registre : chaque version est un tag git (`v1.5.0`, `v1.5.0-rc.2`) accompagné de sa GitHub Release. Un projet l'utilise en dépendance git, dans son `pubspec.yaml` :

```yaml
dependencies:
  mon_projet:
    git:
      url: https://github.com/FloRobart/mon-projet-lib.git
      ref: v1.5.0
```

- `ref` fixe la version : changer le tag pour monter de version, puis `flutter pub get`.
- Le nom de la dépendance (`mon_projet`) est le `name` du `pubspec.yaml` de la librairie, pas le nom du dépôt.
- Pour une librairie dans un dépôt privé, la machine qui fait `flutter pub get` doit avoir accès au dépôt (clé SSH avec `url: git@github.com:FloRobart/mon-projet-lib.git`, ou un token).
- La CI ne modifie pas le champ `version` du `pubspec.yaml` : une dépendance git ne le lit pas, seul le tag compte.

## Android

### Fichiers publiés

`<nom>-vX.Y.Z.apk` et `<nom>-vX.Y.Z.aab`, attachés à la GitHub Release, par exemple `floraccess-v1.5.0-rc.2.apk`.

- **build-name** : `X.Y.Z`, sans le suffixe `-rc.N` que les stores refusent.
- **build-number** : le numéro du run de la CI, qui augmente à chaque build comme l'exigent les stores.

### Signature

Sans secrets, l'APK et l'AAB sont signés avec la clé de debug : ils s'installent, mais aucun store ne les accepte. Pour signer avec ta clé :

1. Créer une clé d'upload, si ce n'est pas déjà fait :

   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```

2. Ajouter quatre secrets au dépôt (Settings → Secrets and variables → Actions) :

   | Secret | Valeur |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | Le fichier, encodé : `base64 --wrap=0 upload-keystore.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore |
   | `ANDROID_KEY_ALIAS` | Alias de la clé, par exemple `upload` |
   | `ANDROID_KEY_PASSWORD` | Mot de passe de la clé |

3. Faire lire `android/key.properties` par `android/app/build.gradle(.kts)`, comme dans la [documentation Flutter](https://docs.flutter.dev/deployment/android#configure-signing-in-gradle). La CI écrit ce fichier, et le keystore dans `android/app/upload-keystore.jks`, juste avant le build.

Ne jamais commiter `key.properties` ni le keystore : les ajouter au `.gitignore`.
