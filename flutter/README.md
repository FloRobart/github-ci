# Flutter

La CI d'un projet Flutter, git flow compris :

- une **application** : la version web en image Docker s'il y a un `Dockerfile`, et Android. Sans les secrets de signature, un APK signé avec la clé de debug est attaché à la GitHub Release. Avec eux, l'APK et l'AAB signés sont attachés, puis l'AAB est envoyé sur Google Play. L'APK est construit comme F-Droid le reconstruit : F-Droid peut donc publier ce même APK, sans rien demander à la CI ([F-Droid](#f-droid)) ;
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

- Un `pubspec.lock` versionné et cohérent, si la version de Flutter est fixée : voir [Le job qualité](#le-job-qualité).
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
| `flutter-version` | Version exacte du `pubspec.yaml`, sinon dernière stable | Version de Flutter, par exemple `3.35.0`. Voir [Version de Flutter](#version-de-flutter). |
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

## Version de Flutter

Chaque job qui installe Flutter (qualité, Android, pub.dev) applique ces règles, de haut en bas. Le `ci.yml` du projet n'a rien à changer.

| Situation | Version installée |
|---|---|
| L'option `flutter-version` est renseignée | Cette valeur, telle quelle |
| `environment.flutter` du `pubspec.yaml` est une version exacte (`X.Y.Z`) | Cette version |
| `environment.flutter` est absent, ou est une plage comme `>=3.0.0` (cas d'une librairie) | La dernière stable, avec un avertissement dans le run |

```yaml
environment:
  flutter: 3.47.9
```

La version exacte rend les builds reproductibles. Elle doit exister sur le canal `stable`, sinon le job échoue. Le `Dockerfile` n'est pas concerné : il choisit sa propre version de Flutter.

## Le job qualité

1. `flutter pub get --enforce-lockfile --no-example` si la version de Flutter est fixée (`flutter pub get` dans `example/` ensuite, s'il existe), sinon `flutter pub get`
2. `dart format --output=none --set-exit-if-changed .`
3. `flutter analyze`
4. `flutter test`
5. Pour une application, le build de ce que la release construit, sans rien publier :
   - Android, si l'option `android` est active : `flutter build apk --debug`, sans besoin des secrets de signature ;
   - l'image Docker, si l'option `docker-image` est active et qu'il y a un `Dockerfile` : construite mais jamais poussée.

Un build Android ou un `Dockerfile` cassé est donc vu dans la pull request, et pas au moment de la release. Une librairie n'a rien à construire : `flutter analyze` compile déjà tout son code.

Quand la version de Flutter est fixée (option `flutter-version` ou version exacte du `pubspec.yaml`), `--enforce-lockfile` fait échouer le job au lieu de modifier le `pubspec.lock`. Dans ces cas, lancer `flutter pub get` avec la version de Flutter de la CI, puis commiter le `pubspec.lock` :

- le `pubspec.lock` n'est pas versionné ;
- le `pubspec.lock` ne correspond plus au `pubspec.yaml` ;
- le `pubspec.lock` a été généré avec une autre version de Flutter, qui impose d'autres versions de ses paquets.

Seul le `pubspec.lock` de la racine est contrôlé : celui d'`example/` n'est pas nécessaire. Sans version fixée, le `pubspec.lock` n'est pas contrôlé : chaque nouvelle stable peut changer les versions imposées par Flutter, ce qui casserait le projet sans aucun commit.

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

Le `pubspec.yaml` commité porte déjà la version, écrite par la CI sur la branche de release (voir [gitflow/README.md](../gitflow/README.md#les-fichiers-de-version)). Après la GitHub Release d'une version finale, la CI retire le build number `+N` de la copie publiée, puis lance `flutter pub publish`. Le job est ignoré, avec un message, quand :

- le secret `PUB_DEV_SERVICE_ACCOUNT_JSON` n'existe pas ;
- le dépôt n'est pas public : le code d'un dépôt privé ne part jamais sur pub.dev ;
- le `pubspec.yaml` contient `publish_to: none` ;
- la version existe déjà sur pub.dev : un run en échec peut donc être relancé.

Un refus de pub.dev ne bloque ni le tag ni le back-merge : corriger, puis **Re-run failed jobs**.

**Pourquoi un compte de service Google, et pas la publication automatique de GitHub ?** pub.dev n'accepte le jeton de GitHub Actions que sur un workflow lancé par le push d'un tag. Ici, la version finale part d'un push sur `main`, et le tag créé par la CI ne lance aucun workflow. pub.dev documente une autre méthode, qui marche depuis n'importe quel événement : un compte de service Google Cloud.

À configurer une fois par librairie :

1. **Publier la première version à la main**, depuis le poste : pub.dev ne permet la publication automatique que d'un paquet qui existe déjà. Mettre dans le `pubspec.yaml` la version du dernier tag, ou `1.0.0` pour un projet sans tag, puis `flutter pub publish`. La CI ignorera cette version, déjà publiée.
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

### Ce qui est publié, selon les secrets

| Secrets du dépôt | Publication | Clé de signature |
|---|---|---|
| Aucun store | GitHub Release | Ta clé si les secrets `ANDROID_*` existent, sinon la clé de debug |
| `F_DROID_ENABLE` = `true` | GitHub Release, que F-Droid publie ([F-Droid](#f-droid)) | Ta clé, obligatoire : sans elle, le run s'arrête avant toute publication |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | GitHub Release, puis Google Play (version finale) | Ta clé, obligatoire : sans elle, le run s'arrête avant toute publication |

`F_DROID_ENABLE` vaut `true` ou `false` ; `false` revient à ne pas avoir le secret. Toute autre valeur arrête le run. Les deux stores se cumulent.

### Fichiers publiés

| | Sans les secrets de signature | Avec les secrets de signature |
|---|---|---|
| Attaché à la GitHub Release | `<nom>-vX.Y.Z.apk`, signé avec la clé de debug | `<nom>-vX.Y.Z.apk` et `<nom>-vX.Y.Z.aab`, signés avec ta clé |
| Google Play (version finale) | Rien | L'AAB, si le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` existe |

Par exemple `floraccess-v1.5.0-rc.2.apk`.

- **versionName** : `X.Y.Z`, sans le suffixe `-rc.N` que les stores refusent.
- **versionCode** : calculé depuis la version, `X × 1 000 000 + Y × 1 000 + Z`. Par exemple `1.5.2` donne `1005002`. Chaque version a donc un code plus grand que la précédente, comme l'exigent Android et Google Play, quel que soit le run qui l'a construite.

La CI écrit le `versionCode` dans le `pubspec.yaml`, derrière la version : `version: 1.5.2+1005002` (voir [gitflow/README.md → Les fichiers de version](../gitflow/README.md#les-fichiers-de-version)). Le tag d'une version finale contient ainsi tout ce qu'il faut pour reconstruire son APK à l'identique, ce que fait F-Droid. Une release candidate est construite avant son commit de version : elle reçoit ces deux valeurs en options de build. Elle a le même `versionCode` que sa version finale, qui s'installe par-dessus.

Limites : Y et Z inférieurs à 1 000, X inférieur à 2 100. Android refuse un `versionCode` au-delà de 2 100 000 000.

L'APK signé avec la clé de debug s'installe sur un téléphone, mais aucun store ne l'accepte. Sans les secrets, la CI ne construit donc pas d'AAB, qui ne servirait qu'à Google Play.

### Environnement de build

La release Android est construite comme F-Droid la reconstruit :

- dans l'image de son serveur de build, `registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie` (Debian, avec son Java et son SDK Android) ;
- dans son dossier de build, `/home/vagrant/build/<applicationId>`, avec le cache pub à l'intérieur ;
- avec la version de Flutter du `pubspec.yaml` (voir [Version de Flutter](#version-de-flutter)), clonée dans `/home/vagrant/build/srclib/flutter`.

Un build Flutter dépend de son dossier, écrit dans `libapp.so`, et de la version de Java. Construit ailleurs, l'APK ne serait jamais identique à celui de F-Droid.

- L'`applicationId` est lu dans `android/app/build.gradle(.kts)`. S'il n'y est pas écrit une seule fois en toutes lettres (plusieurs flavors, une variable), l'APK est construit dans le dossier du dépôt, avec un avertissement : il marche, mais F-Droid ne pourra pas le reproduire.
- L'image suit le tag mobile `buildserver-trixie`, exprès : F-Droid construit avec son image du moment, et GitLab supprime les anciens digests de ce tag. Un digest fixé s'éloignerait de F-Droid, puis cesserait d'exister. En contrepartie, les secrets de signature passent dans cette image officielle de F-Droid.
- Rien n'est mis en cache, comme chez F-Droid : Flutter, le NDK et les dépendances Gradle sont téléchargés à chaque release.

Le build de contrôle des pull requests (`flutter build apk --debug`, voir [Le job qualité](#le-job-qualité)) reste sur la machine de GitHub : il ne publie rien.

### Signature

1. **Créer la clé de signature de l'application**, une fois pour toutes. Elle signe l'APK de la GitHub Release, que F-Droid publie tel quel, et l'AAB envoyé à Google Play :

   ```bash
   keytool -genkeypair -v -keystore release-keystore.jks -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10000 -alias release
   ```

   **La sauvegarder**, avec ses mots de passe, hors du dépôt : gestionnaire de mots de passe et copie hors ligne. Android refuse une mise à jour signée avec une autre clé : sans elle, plus aucune mise à jour sur GitHub ni sur F-Droid, sauf à changer d'`applicationId` et à faire réinstaller l'application.

2. **Ajouter quatre secrets au dépôt** (Settings → Secrets and variables → Actions). Ils vont ensemble : la CI échoue s'il n'y en a qu'une partie.

   | Secret | Valeur |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | Le fichier, encodé : `base64 --wrap=0 release-keystore.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore |
   | `ANDROID_KEY_ALIAS` | Alias de la clé : `release` avec la commande ci-dessus |
   | `ANDROID_KEY_PASSWORD` | Mot de passe de la clé, le même que celui du keystore pour un keystore PKCS12 |

3. **Faire lire `android/key.properties` par `android/app/build.gradle.kts`**, avec la clé de debug à défaut. F-Droid, qui n'a pas la clé, construit ainsi l'application sans rien modifier :

   ```kotlin
   import java.util.Properties

   val releaseKeystorePropertiesFile = rootProject.file("key.properties")
   val releaseKeystoreProperties = Properties()

   if (releaseKeystorePropertiesFile.exists()) {
       releaseKeystorePropertiesFile.inputStream().use { releaseKeystoreProperties.load(it) }
   }

   android {
       // ...

       signingConfigs {
           if (releaseKeystorePropertiesFile.exists()) {
               create("release") {
                   storeFile = file(releaseKeystoreProperties.getProperty("storeFile"))
                   storePassword = releaseKeystoreProperties.getProperty("storePassword")
                   keyAlias = releaseKeystoreProperties.getProperty("keyAlias")
                   keyPassword = releaseKeystoreProperties.getProperty("keyPassword")
               }
           }
       }

       buildTypes {
           release {
               signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
           }
       }
   }
   ```

La CI écrit `android/key.properties` et le keystore (`android/app/release-keystore.jks`) juste avant le build. Ensuite, elle vérifie que l'APK n'est pas resté signé avec la clé de debug, et affiche dans le résumé du run l'empreinte SHA-256 du certificat, que demande F-Droid.

Ne jamais commiter `key.properties` ni le keystore : le `android/.gitignore` créé par Flutter ignore déjà `key.properties`, `*.jks` et `*.keystore`.

### F-Droid

F-Droid n'a pas d'API de publication. Une fois l'application acceptée, son robot repère chaque nouveau tag `vX.Y.Z`, reconstruit l'application depuis le code source et la compare à l'APK de la GitHub Release. S'ils sont identiques, signature mise à part, F-Droid publie **cet APK, signé avec ta clé**. Sinon, cette version n'est pas publiée sur F-Droid, et rien d'autre ne change.

La CI n'envoie donc rien à F-Droid : il suffit que la release soit signée ([Signature](#signature)) et reproductible ([Environnement de build](#environnement-de-build)). Les release candidates ne vont jamais sur F-Droid.

Le secret **`F_DROID_ENABLE` à `true`** active F-Droid pour le dépôt :

- la clé de signature devient obligatoire : sans elle, le run s'arrête avant de publier quoi que ce soit ;
- après le build, la CI reconstruit l'application comme F-Droid (copie neuve, sans la clé), puis recopie la signature de l'APK publié sur ce build avec `apksigcopier`, l'outil de F-Droid. S'ils diffèrent, le run s'arrête : aucune GitHub Release que F-Droid refuserait. Le résumé du run confirme sinon que l'APK est reproductible.

`F_DROID_ENABLE` ne peut pas empêcher F-Droid de suivre les tags d'une application déjà inscrite : c'est sa recette dans fdroiddata qui l'y fait figurer. Pour retirer l'application de F-Droid, ouvrir une merge request qui la désactive dans fdroiddata.

**Prérequis du projet** :

- un dépôt public, sous licence libre, sans dépendance propriétaire (Firebase, services Google Play, publicité, pistage) ;
- la version de Flutter fixée dans le `pubspec.yaml`, et le `pubspec.lock` commité ;
- dans `android/app/build.gradle.kts` : la signature ci-dessus, et `dependenciesInfo { includeInApk = false }`. Le plugin Android ajoute sinon à l'APK la liste de ses dépendances, chiffrée pour Google, que F-Droid refuse ;
- une application qui marche construite sans aucune option : F-Droid lance `flutter build apk --release`, sans `--dart-define` ;
- la fiche de l'application dans `fastlane/metadata/android/<langue>/` : `title.txt`, `short_description.txt` (80 caractères au plus, sans point final), `full_description.txt`, `images/icon.png`, `images/phoneScreenshots/1.png`, `2.png`…

**À faire une fois par application**, après une première version finale signée :

1. Créer un compte sur [gitlab.com](https://gitlab.com).
2. Forker [fdroid/fdroiddata](https://gitlab.com/fdroid/fdroiddata), et y créer une branche nommée comme l'`applicationId`.
3. Écrire `metadata/<applicationId>.yml`, d'après le modèle ci-dessous.
4. Pousser la branche : la CI du fork vérifie le fichier et construit l'application. Corriger jusqu'à ce qu'elle passe.
5. Ouvrir une merge request vers `fdroid/fdroiddata`, intitulée `New App: <applicationId>`, et répondre aux questions des relecteurs.

```yaml
Categories:
  - <Catégorie de F-Droid, par exemple Finance Manager>
License: GPL-3.0-only
SourceCode: https://github.com/FloRobart/<dépôt>
IssueTracker: https://github.com/FloRobart/<dépôt>/issues
Changelog: https://github.com/FloRobart/<dépôt>/releases

AutoName: <Nom de l'application>

RepoType: git
Repo: https://github.com/FloRobart/<dépôt>.git
Binaries: https://github.com/FloRobart/<dépôt>/releases/download/v%v/<nom>-v%v.apk

Builds:
  - versionName: X.Y.Z
    versionCode: <versionCode de X.Y.Z>
    commit: <hash complet du commit du tag vX.Y.Z>
    output: build/app/outputs/flutter-apk/app-release.apk
    srclibs:
      - flutter@stable
    prebuild:
      - flutterVersion=$(sed -n -E 's/^ +flutter:[ "]*([0-9]+[.][0-9]+[.][0-9]+).*/\1/p' pubspec.yaml)
      - '[[ $flutterVersion ]]'
      - git -C $$flutter$$ checkout -f $flutterVersion
      - export PUB_CACHE=$(pwd)/.pub-cache
      - $$flutter$$/bin/flutter config --no-analytics
      - $$flutter$$/bin/flutter pub get --enforce-lockfile
    scandelete:
      - .pub-cache
    build:
      - export PUB_CACHE=$(pwd)/.pub-cache
      - $$flutter$$/bin/flutter build apk --release

AllowedAPKSigningKeys: <empreinte SHA-256 du certificat, affichée dans le résumé du run>

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9]+\.[0-9]+\.[0-9]+$
UpdateCheckData: pubspec.yaml|version:\s.+\+(\d+)|.|version:\s(.+)\+
CurrentVersion: X.Y.Z
CurrentVersionCode: <versionCode de X.Y.Z>
```

- `Categories` : une des catégories de [config/categories.yml](https://gitlab.com/fdroid/fdroiddata/-/blob/master/config/categories.yml) de fdroiddata.
- `Binaries` et `AllowedAPKSigningKeys` font publier l'APK de la GitHub Release, avec ta signature. `<nom>-v%v.apk` est le nom du fichier attaché à la release, `%v` la version.
- `AutoUpdateMode`, `UpdateCheckMode` et `UpdateCheckData` font suivre les tags : le robot de F-Droid lit la version et le `versionCode` dans le `pubspec.yaml` de chaque nouveau tag `vX.Y.Z`, puis ajoute la version tout seul. Le motif ignore les tags de release candidate.
- `compute-android-version-code.sh X.Y.Z` (dans [gitflow/scripts](../gitflow/scripts)) donne le `versionCode` d'une version, et le `pubspec.yaml` du tag le porte.

Une fois la merge request acceptée, la première version arrive sur F-Droid en quelques jours. Les versions finales suivantes y arrivent seules, quelques jours après leur GitHub Release.

### Google Play

Après la GitHub Release d'une version finale, la CI envoie l'AAB signé sur la piste `google-play-track` (`production` par défaut). Le job est ignoré, avec un message, tant que le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` n'existe pas. Si ce secret existe sans les secrets de signature, le job Android arrête le run avant toute publication : Google Play refuse la clé de debug.

Le nom de paquet (`applicationId`) est lu dans l'APK construit : rien à configurer. Une release candidate n'est jamais envoyée : elle s'essaie avec l'APK attaché à sa pre-release. Un refus de Google Play ne bloque ni le tag ni le back-merge.

À configurer une fois par application :

1. **Choisir la clé de signature de Google Play, à la création de l'application** : par défaut, Google signe l'application avec une clé qu'il génère lui-même. Les utilisateurs ne pourraient alors pas passer de Google Play à F-Droid ou à la GitHub Release, ni l'inverse, sans désinstaller l'application. Pour garder une seule signature partout, choisir d'importer sa propre clé (*Play App Signing* → utiliser une autre clé → exporter et importer une clé depuis un Java KeyStore, avec l'outil PEPK fourni par la Play Console), et y donner la clé de [Signature](#signature). Ce choix est définitif.
2. **Créer l'application dans la Play Console et publier la première version à la main** : l'API de Google Play ne fait que des mises à jour d'une application qui existe déjà. Envoyer pour cela l'AAB attaché à la GitHub Release d'une version finale, **avant** de créer le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Une release candidate ne convient pas : elle a le même `versionCode` que sa version finale, que la CI ne pourrait plus envoyer.
3. **Créer un compte de service** dans Google Cloud, avec l'API *Google Play Android Developer* activée, et lui créer une clé JSON.
4. **L'inviter dans la Play Console** : Utilisateurs et autorisations → Inviter un utilisateur → l'adresse du compte de service, avec les droits de publication sur l'application (pistes de test et production).
5. **Enregistrer la clé** dans le secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` du dépôt (tout le contenu du fichier).

- Un compte développeur personnel récent doit passer par un test fermé avant d'avoir accès à la production : régler alors `google-play-track: alpha` le temps de l'obtenir.
- Une version déjà reçue par Google Play est refusée une seconde fois (`versionCode` déjà utilisé) : ne relancer le job que si l'envoi lui-même a échoué.
- L'envoi est soumis à la validation de Google : la version n'est visible qu'une fois validée.
