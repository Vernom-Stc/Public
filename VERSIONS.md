# Versions de Kerckhoffs

*English below.*

Chaque version officielle est signée par l'auteur de Kerckhoffs. Cette liste est la référence : si le numéro de référence affiché dans votre application (« Vérifier ma version ») n'est pas celui de cette page, à l'adresse officielle, ce n'est pas une version officielle.

| Version | Date | Numéro de référence | Version figée (SHA-256 du fichier) |
|---|---|---|---|
| 0.6.2 | 2026-10-25 | `AE2D-FE2A-7CA0-14A5` | `61efabec6edbf3dfdd5e9c348f9e1d97d45e9fb37e83ec8e356f2f42e1cbed0f` |
| 0.6.1 | 2026-10-22 | `C3F5-27BA-D8FE-E038` | `e543d50b496ce18770d5f03bc13ce1b1d3011331f8d0f534e515aa5bf828945b` |

## Aucune mise à jour toute seule

La version que vous avez vérifiée en l'installant reste exactement la même, avec ou sans internet, tant que vous ne l'effacez pas. Sans connexion, rien ne vous manque : votre version fonctionne entièrement.

Si une nouvelle version existe, Kerckhoffs vous le signale, c'est tout. C'est vous qui allez la chercher, avec « Chercher une nouvelle version » sur l'accueil. Elle est alors téléchargée, vérifiée fichier par fichier, et ne remplace la vôtre que si vous touchez « Utiliser ». Si un seul octet a été changé par quelqu'un d'autre que l'auteur, elle est refusée et un bandeau rouge vous prévient.

## La version figée, pour les usages sensibles

Un seul fichier, `telecharger/kerckhoffs-<version>.html`. Il s'ouvre d'un double-clic, fonctionne sans internet et ne se met jamais à jour tout seul : ce que vous avez vérifié une fois reste exactement ce que vous utilisez. Il est signé avec la même clé (`.html.sig`).

## Vérifier soi-même

La clé publique de l'auteur est dans `cle-publique.pem` (Ed25519). Elle est aussi inscrite dans `verification.js`.

Avec Node, depuis le dossier du dépôt :

    node outils/verifier.mjs

Sans Node, avec les outils présents sur presque tous les ordinateurs :

    sha256sum -c empreintes.txt
    openssl pkeyutl -verify -pubin -inkey cle-publique.pem -rawin -in empreintes.txt -sigfile empreintes.sig
    openssl pkeyutl -verify -pubin -inkey cle-publique.pem -rawin -in telecharger/kerckhoffs-<version>.html -sigfile telecharger/kerckhoffs-<version>.html.sig

Les trois doivent répondre « OK » ou « Signature Verified Successfully ».

Le numéro de référence est le début du SHA-256 de `empreintes.txt`, en quatre groupes.

## Preuves de date dans la blockchain Bitcoin

Trois fichiers sont horodatés avec OpenTimestamps : leur empreinte est inscrite dans un bloc Bitcoin. Personne, pas même l'auteur, ne peut faire croire qu'ils ont été créés plus tard ou modifiés depuis.

| Fichier | Preuve | Bloc Bitcoin |
|---|---|---|
| `cle-publique.pem` (la clé de l'auteur) | `cle-publique.pem.ots` | 972 602, 22 octobre 2026 |
| `horodatage/0.6.1/empreintes.txt` (la liste de la version 0.6.1, numéro de référence `C3F5-27BA-D8FE-E038`) | `horodatage/0.6.1/empreintes.txt.ots` | 972 602, 22 octobre 2026 |
| `marque/charte-logo.html` (le logo) | `marque/charte-logo.html.ots` | 972 602, 22 octobre 2026 |

Pour vérifier sans rien installer : sur [opentimestamps.org](https://opentimestamps.org), déposez le fichier et sa preuve `.ots`. Le site doit répondre « Bitcoin block 972602 attests existence as of 2026-10-22 ».

Pour vérifier avec votre propre nœud Bitcoin : `ots verify cle-publique.pem.ots` (client OpenTimestamps). La racine de Merkle du bloc 972 602, telle que l'affichent les explorateurs de blocs, est `b7210b1d54a4805eab86a8b93449889b2e0b607b97309785935d8907ad395e4c`.

## Les messages de l'auteur

Toute communication de l'auteur est signée avec la même clé. Pour la vérifier : dans Kerckhoffs, « Vérifier ma version », puis « Vérifier un message de l'auteur ». Un message sans signature valide ne vient pas de l'auteur.

---

# Kerckhoffs releases

Every official release is signed by the author of Kerckhoffs. The table above is the reference: if the fingerprint shown in your app ("Vérifier ma version") differs from the one on this page at the official address, it is not an official release. The app never updates itself: a new release is only announced, and is downloaded only when you ask for it. It is then checked file by file against the author's signature and refused if anything differs; it replaces yours only if you tap "Utiliser". The frozen single-file version (`telecharger/`) never updates itself and is signed with the same Ed25519 key (`cle-publique.pem`). Verify with `node outils/verifier.mjs`, or with `sha256sum -c` and `openssl pkeyutl -verify` as shown above. The author's public key, the 0.6.1 file list and the logo are timestamped with OpenTimestamps in Bitcoin block 972,602 (22 October 2026); each proof is the `.ots` file next to it.
