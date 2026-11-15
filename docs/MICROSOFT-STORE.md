# Publier GestyLoc sur le Microsoft Store (MSIX)

> **Objectif** : supprimer l'avertissement « Windows a protégé votre ordinateur »
> **sans acheter de certificat**. Le Store héberge le paquet, le **signe** et le
> met à jour : plus de SmartScreen à l'installation.
> Décision de principe : 15/11/2026. Chantier **non commencé**.
> Suivi des cases : `ROADMAP.md` § « Microsoft Store (MSIX) ».

## Ce que ça change — et ce que ça ne change pas

| | |
|---|---|
| Ce que ça donne | Installation en un clic depuis le Store, **aucun avertissement**, mises à jour automatiques prises en charge par Windows |
| Ce que ça coûte | **0 €** (inscription individuelle gratuite depuis le 10/09/2025, ~200 marchés, sans carte bancaire) |
| Ce que ça ne change pas | La release GitHub (`setup.exe` NSIS) reste en place : elle, et elle seule, gardera l'avertissement. Deux canaux, un seul paquet signé |
| Ce que ça n'autorise pas | Un certificat acheté ne supprimerait pas l'alerte de toute façon (OV/EV : réputation à construire release après release depuis 2024 ; Azure Artifact Signing fermé aux particuliers hors USA/Canada) — cf. `AGENTS.md` §7 |

Le Store ne juge pas la licence du logiciel : la PolyForm Noncommercial ne bloque
rien (contrairement à SignPath, qui exige une licence validée OSI). À reconfirmer
au moment de la soumission, mais ce n'est pas un obstacle connu.

## Phase 0 — trois décisions avant de toucher au code

1. **Identité d'éditeur.** Un compte individuel publie sous une identité
   **vérifiée** (pièce d'identité + selfie). Le nom d'éditeur affiché doit
   correspondre à cette identité ; « GestyLoc » passe sans problème comme **nom
   d'application**, mais pas forcément comme nom d'éditeur. À trancher à la
   création du compte, et à noter ici une fois connu.
2. **Politique de confidentialité.** Une URL publique est demandée à la
   soumission. Trois phrases suffisent : application 100 % hors ligne, aucune
   donnée transmise, aucune télémétrie, base SQLite locale sous
   `%APPDATA%\gestyloc`. Hébergement gratuit : GitHub Pages du dépôt.
3. **Périmètre.** Publier **x64 uniquement** au départ (le paquet arm64 est une
   option, pas un prérequis).

## Phase 1 — compte et réservation du nom

- Créer le compte sur `storedeveloper.microsoft.com` (compte Microsoft personnel).
- Vérification d'identité : pièce d'identité + selfie, sans frais.
- Réserver le nom **GestyLoc**, puis créer l'application dans Partner Center.
- **Récupérer l'identité du paquet** — les trois valeurs suivantes doivent être
  recopiées telles quelles dans `electron-builder.yml`, sinon le paquet est
  refusé au téléversement :
  - `Package/Identity/Name` (ex. `1234Galaxiel.GestyLoc`)
  - `Package/Identity/Publisher` (ex. `CN=A1B2C3D4-…`)
  - `Package/Properties/PublisherDisplayName`

## Phase 2 — packaging MSIX

Cible `msix` d'electron-builder (successeur d'`appx`, marquée **beta** dans la
doc) ; `appx` produit le même format et reste le repli si la cible `msix` casse.

Points structurants :

- **Full-trust obligatoire** : `uap10:RuntimeBehavior="packagedClassicApp"` et
  `uap10:TrustLevel="mediumIL"`. En `appContainer`, Windows **redirige** les
  écritures vers `AppData` → la base ne serait plus au chemin attendu et
  l'existant du bailleur deviendrait invisible. En full-trust, `%APPDATA%\gestyloc`
  reste le vrai chemin : rien à migrer, la base existante est reprise telle
  quelle (à confirmer par un test réel).
- **Images du manifeste** : Square44x44Logo, Square150x150Logo, StoreLogo 50×50,
  Wide310x150Logo (optionnel), plus les variantes `targetsize`/`scale` si on
  veut un rendu net dans le Store.
- **Cible Windows** : 10.0.17763 minimum (Windows 10 1809) ; c'est le plancher de
  uap10, donc Windows 10 2004+ en pratique pour les attributs modernes.
- **Pas d'élévation** : GestyLoc s'installe par utilisateur, c'est compatible.
- **Test local** : un `.msix` doit être signé pour s'installer. Pour tester hors
  Store, auto-signé + certificat ajouté aux racines de confiance de la machine de
  test (jamais sur le poste du bailleur), ou mode développeur Windows.

## Phase 3 — adaptations dans le code

| Point | Ce qu'il faut faire |
|---|---|
| `electron-updater` | **Désactiver dans le build Store** (drapeau d'environnement ou constante de build) : sinon l'app téléchargera des installateurs NSIS par-dessus une installation gérée par le Store. La vérification « au lancement en production seulement » doit être neutralisée pour ce canal |
| Mode portable (marqueur `donnees/`) | Sans objet : le dossier d'installation `C:\Program Files\WindowsApps\…` est **en lecture seule**. La détection du marqueur doit être court-circuitée en build Store |
| Chemins de données | Rien à changer : `app.getPath('userData')` reste `%APPDATA%\gestyloc` en full-trust — mais **le vérifier sur une installation réelle**, c'est le point qui casse le plus facilement |
| `better-sqlite3` | Le module natif déjà recompilé pour Electron (`electron-builder install-app-deps`) doit être embarqué tel quel ; le test d'installation réelle le confirmera |
| Journaux | `%APPDATA%\gestyloc\logs\main.log` reste la référence du support |
| Rien d'écrit à côté de l'exe | Déjà le cas (PDF générés côté renderer, exports vers un dossier choisi par l'utilisateur) |

Ne pas taguer de release pour ce chantier tant que la soumission n'est pas
acceptée : le numéro de version publiable se décide au moment de la publication.

## Phase 4 — soumission Partner Center

- **Paquet** : le `.msixupload` produit par electron-builder (l'upload multi-arch
  est optionnel pour un x64 seul).
- **Fiche** : description FR, mots-clés, catégorie (Business ou Productivity),
  au moins **une capture d'écran ≥ 1366×768**, icône, prix **gratuit**.
- **Classification d'âge** : questionnaire IARC (gratuit, quelques minutes).
- **Politique de confidentialité** : l'URL de la phase 0.
- **Notes de certification** — c'est ce qui évite un rejet. À y mettre, en
  clair : application 100 % hors ligne, aucune connexion réseau, aucun compte,
  données locales uniquement, et **comment vérifier le fonctionnement sur une
  machine vierge** (remise à zéro dans Paramètres, puis import d'un CSV de
  démonstration, ou usage direct en création de bien/locataire/bail).
- **Rejet typique à éviter** : une application qui ne montre rien d'utilisable
  sans données réelles. La remise à zéro existe déjà ; le préciser.

## Phase 5 — après publication

- Ajouter un bouton « Microsoft Store » en tête du `README.md` (le bloc
  SmartScreen y reste, pour les téléchargements GitHub).
- Garder les deux canaux : Store pour le grand public, releases GitHub pour le
  contrôle de version et les empreintes SHA-256.
- Les deux canaux écrivent dans le **même** `%APPDATA%\gestyloc` : une seule
  base, donc pas de duplication des données. Ne jamais installer les deux sur la
  même machine comme deux applications distinctes « à garder » — c'est la même,
  avec deux façons de la mettre à jour.

## Risques connus

| Risque | Parade |
|---|---|
| Cible `msix` beta d'electron-builder | Repli sur `appx` (même format, même manifeste) |
| `better-sqlite3` ou un chemin qui casse sous MSIX | Test d'installation réelle **avant** la soumission, sur une copie de la base |
| Virtualisation `AppData` si le manifeste est mal réglé | Full-trust `mediumIL` explicite + vérification du chemin de la base à l'écran Paramètres |
| Deux canaux de mise à jour qui se marchent dessus | `electron-updater` coupé dans le build Store, un point c'est tout |
| Refus de certification faute de contenu démontrable | Notes de certification détaillées (phase 4) |
| Nom d'éditeur imposé par la vérification d'identité | Trancher en phase 0, avant de réserver quoi que ce soit |

## Ce qu'il ne faut pas faire

- **Acheter un certificat** pour ce motif : ça ne supprime pas l'alerte, et la
  décision est déjà prise (`AGENTS.md` §7).
- **Repackager l'installeur NSIS existant** avec l'outil MSIX Packaging Tool :
  ça produit un paquet qui embarque un installeur, fragile, et qui garde le
  comportement d'installation par utilisateur. La cible native d'electron-builder
  est plus propre.
- **Publier la version portable** sur le Store : le mode `donnees/` n'a aucun
  sens là-dedans.
