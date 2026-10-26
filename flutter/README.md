# Flutter

La CI d'un projet Flutter, git flow compris :

- une **application** : la version web en image Docker s'il y a un `Dockerfile`, et Android. Sans les secrets de signature, un APK signé avec la clé de debug est attaché à la GitHub Release. Avec eux, l'APK et l'AAB signés sont attachés, puis l'AAB est envoyé sur Google Play ;
- une **librairie** : le tag git et la GitHub Release, puis pub.dev.

| Moment | Ce qui tourne |
|---|---|
| Pull request | Règles du git flow + qualité |
| Bouton **Run workflow** | Qualité, puis release candidate : builds de l'application, pre-release |
| Merge sur `main` | Qualité, puis version finale : builds de l'application, release, puis Google Play ou pub.dev |

Le workflow est [.github/workflows/flutter.yml](../.github/workflows/flutter.yml). Les étapes du git flow sont décrites dans [gitflow/README.md](../gitflow/README.md).

## Application ou librairie

Un projet Flutter est un projet avec un `pubspec.yaml` à la racine, même s'il a aussi un `package.json` pour ses outils. Le reste se lit dans le nom du dépôt et le `Dockerfile` :

| Nom du dépôt | Dockerfile | Type | Publié |
|---|---|---|---|
| `mon-projet-lib` | Interdit | Librairie | Tag, GitHub Release, pub.dev |
| `mon-projet-app` | Facultatif : sans lui, application mobile uniquement | Application | Image web (avec un `Dockerfile`), Android |
| Sans suffixe | Présent | Application | Image web, Android |
| Sans suffixe | Absent | Librairie, avec un avertissement | Tag, GitHub Release, pub.dev |

Une application mobile sans `Dockerfile` doit donc finir par `-app` : sinon elle est prise pour une librairie. Toutes les règles sont dans [gitflow/README.md → Type de projet](../gitflow/README.md#type-de-projet).

## Prérequis du projet

- Un dossier `test/` avec au moins un test : `flutter test` échoue sans lui.
- Un code formaté par `dart format` : la qualité refuse un fichier mal formaté.
- Pour l'image web d'une application : un `Dockerfile` à la racine qui construit **lui-même** la version web. [example/Dockerfile](example/Dockerfile) le fait en deux étapes, un build Flutter puis nginx.
- Pour publier une application sur Google Play : la [signature](#signature) et [Google Play](#google-play), décrits plus bas.
- Pour publier une librairie sur pub.dev : voir [pub.dev](#pubdev).

## Installation

Le plus simple : le `ci.yml` commun à tous les projets, qui détecte un projet Flutter tout seul. Voir [auto/README.md](../auto/README.md).

Pour appeler directement cette CI :

1. Copier [example/ci.yml](example/ci.yml) dans le projet, sous `.github/workflows/ci.yml`, sur `dev` et sur `main`.
2. Si besoin, copier [example/Dockerfile](example/Dockerfile) à la racine du projet.
3. Faire les réglages du dépôt, avec le ruleset `protected-branches-type-ci.json` : [gitflow/README.md → Installer dans un projet](../gitflow/README.md#installer-dans-un-projet).

```yaml
jobs:
  ci:
    uses: FloRobart/github-ci/.github/workflows/flutter.yml@main
    secrets: inherit
```

Le job doit garder l'identifiant `ci` : le ruleset attend les vérifications `ci / Gitflow / Checks` et `ci / Quality`.

## Options

| Paramètre | Par défaut | Rôle |
|---|---|---|
| `flutter-version` | Dernière stable | Version de Flutter, par exemple `3.35.0`. La fixer rend les builds reproductibles. |
| `docker-image` | `true` | Publie la version web d'une application en image Docker, si elle a un `Dockerfile`. `false` pour ne pas la publier malgré le `Dockerfile`. |
| `android` | `true` | Construit la version Android d'une application. `false` pour une application uniquement web. |
| `google-play-track` | `production` | Piste Google Play qui reçoit une version finale : `production`, `beta` (test ouvert), `alpha` (test fermé) ou `internal` (test interne). |

Une librairie ignore `docker-image`, `android` et `google-play-track`. Les mêmes options existent sur [auto.yml](../auto/README.md#options).

```yaml
jobs:
  ci:
    uses: FloRobart/github-ci/.github/workflows/flutter.yml@main
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
5. Pour une application, le build de ce que la release construit, sans rien publier :
   - Android, si l'option `android` est active : `flutter build apk --debug`, sans besoin des secrets de signature ;
   - l'image Docker, si l'option `docker-image` est active et qu'il y a un `Dockerfile` : construite mais jamais poussée.

Un build Android ou un `Dockerfile` cassé est donc vu dans la pull request, et pas au moment de la release. Une librairie n'a rien à construire : `flutter analyze` compile déjà tout son code.

## Librairie

| | Release candidate | Version finale |
|---|---|---|
| Tag git et GitHub Release | `v1.5.0-rc.2`, pre-release | `v1.5.0`, release |
| pub.dev | Non | `1.5.0`, si le secret existe |

Une release candidate ne part jamais sur pub.dev : pub.dev garde chaque version pour toujours, et une release candidate s'essaie très bien depuis son tag git.

### Depuis GitHub

Chaque version est un tag git, utilisable en dépendance git dans le `pubspec.yaml` d'un autre projet :

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

### pub.dev

Après la GitHub Release d'une version finale, la CI écrit la version calculée dans le `pubspec.yaml` (sans le commiter), puis lance `flutter pub publish`. Le job est ignoré, avec un message, quand :

- le secret `PUB_DEV_SERVICE_ACCOUNT_JSON` n'existe pas ;
- le dépôt n'est pas public : le code d'un dépôt privé ne part jamais sur pub.dev ;
- le `pubspec.yaml` contient `publish_to: none` ;
- la version existe déjà sur pub.dev : un run en échec peut donc être relancé.

Un refus de pub.dev ne bloque ni le tag ni le back-merge : corriger, puis **Re-run failed jobs**.

**Pourquoi un compte de service Google, et pas la publication automatique de GitHub ?** pub.dev n'accepte le jeton de GitHub Actions que sur un workflow lancé par le push d'un tag. Ici, la version finale part d'un push sur `main`, et le tag créé par la CI ne lance aucun workflow. pub.dev documente une autre méthode, qui marche depuis n'importe quel événement : un compte de service Google Cloud.

À configurer une fois par librairie :

1. **Publier la première version à la main**, depuis le poste : pub.dev ne permet la publication automatique que d'un paquet qui existe déjà. Mettre dans le `pubspec.yaml` la version du dernier tag, ou `0.1.0` pour un projet sans tag, puis `flutter pub publish`. La CI ignorera cette version, déjà publiée.
2. **Créer le compte de service**, dans un projet Google Cloud (le même pour toutes les librairies si tu veux) :

   ```bash
   gcloud iam service-accounts create pub-dev-publisher --project=<projet>
   ```

   ```bash
   gcloud services enable iamcredentials.googleapis.com --project=<projet>
   ```

   ```bash
   gcloud iam service-accounts add-iam-policy-binding pub-dev-publisher@<projet>.iam.gserviceaccount.com --member=serviceAccount:pub-dev-publisher@<projet>.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator --project=<projet>
   ```

   Le rôle *Service Account Token Creator* sur lui-même lui permet de créer le jeton d'identité que pub.dev vérifie.
3. **Créer sa clé** et l'enregistrer dans le secret `PUB_DEV_SERVICE_ACCOUNT_JSON` du dépôt (tout le contenu du fichier), puis supprimer le fichier :

   ```bash
   gcloud iam service-accounts keys create key.json --iam-account=pub-dev-publisher@<projet>.iam.gserviceaccount.com
   ```

4. **Autoriser le compte sur pub.dev** : la page du paquet → Admin → Automated publishing → **Enable publishing with Google Cloud Service account**, avec l'adresse `pub-dev-publisher@<projet>.iam.gserviceaccount.com`.

## Android

### Fichiers publiés

| | Sans les secrets de signature | Avec les secrets de signature |
|---|---|---|
| Attaché à la GitHub Release | `<nom>-vX.Y.Z.apk`, signé avec la clé de debug | `<nom>-vX.Y.Z.apk` et `<nom>-vX.Y.Z.aab`, signés avec ta clé |
| Google Play (version finale) | Rien | L'AAB, si le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` existe |

Par exemple `floraccess-v1.5.0-rc.2.apk`.

- **build-name** : `X.Y.Z`, sans le suffixe `-rc.N` que les stores refusent.
- **build-number** (`versionCode`) : le numéro du run de la CI, qui augmente à chaque build comme l'exige Google Play.

L'APK signé avec la clé de debug s'installe sur un téléphone, mais aucun store ne l'accepte. Sans les secrets, la CI ne construit donc pas d'AAB, qui ne servirait qu'à Google Play.

### Signature

1. Créer une clé d'upload, si ce n'est pas déjà fait :

   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```

2. Ajouter quatre secrets au dépôt (Settings → Secrets and variables → Actions). Ils vont ensemble : la CI échoue s'il n'y en a qu'une partie.

   | Secret | Valeur |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | Le fichier, encodé : `base64 --wrap=0 upload-keystore.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore |
   | `ANDROID_KEY_ALIAS` | Alias de la clé, par exemple `upload` |
   | `ANDROID_KEY_PASSWORD` | Mot de passe de la clé |

3. Faire lire `android/key.properties` par `android/app/build.gradle(.kts)`, comme dans la [documentation Flutter](https://docs.flutter.dev/deployment/android#configure-signing-in-gradle). La CI écrit ce fichier, et le keystore dans `android/app/upload-keystore.jks`, juste avant le build.

Ne jamais commiter `key.properties` ni le keystore : les ajouter au `.gitignore`.

### Google Play

Après la GitHub Release d'une version finale, la CI envoie l'AAB signé sur la piste `google-play-track` (`production` par défaut). Le job est ignoré, avec un message, tant que le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` n'existe pas. Il échoue si ce secret existe sans les secrets de signature : Google Play refuse la clé de debug.

Le nom de paquet (`applicationId`) est lu dans l'APK construit : rien à configurer. Une release candidate n'est jamais envoyée : elle s'essaie avec l'APK attaché à sa pre-release. Un refus de Google Play ne bloque ni le tag ni le back-merge.

À configurer une fois par application :

1. **Créer l'application dans la Play Console et publier la première version à la main** : l'API de Google Play ne fait que des mises à jour d'une application qui existe déjà. Envoyer pour cela l'AAB attaché à une release candidate : il est signé avec ta clé, et son `versionCode` (le numéro du run) reste plus petit que ceux des versions suivantes.
2. **Créer un compte de service** dans Google Cloud, avec l'API *Google Play Android Developer* activée, et lui créer une clé JSON.
3. **L'inviter dans la Play Console** : Utilisateurs et autorisations → Inviter un utilisateur → l'adresse du compte de service, avec les droits de publication sur l'application (pistes de test et production).
4. **Enregistrer la clé** dans le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` du dépôt (tout le contenu du fichier).

- Un compte développeur personnel récent doit passer par un test fermé avant d'avoir accès à la production : régler alors `google-play-track: alpha` le temps de l'obtenir.
- Une version déjà reçue par Google Play est refusée une seconde fois (`versionCode` déjà utilisé) : ne relancer le job que si l'envoi lui-même a échoué.
- L'envoi est soumis à la validation de Google : la version n'est visible qu'une fois validée.
