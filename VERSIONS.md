# Versions de Kerckhoffs

*English below.*

Chaque version officielle est signée par l'auteur de Kerckhoffs. Cette liste est la référence : si le numéro de référence affiché dans votre application (« Vérifier ma version ») n'est pas celui de cette page, à l'adresse officielle, ce n'est pas une version officielle.

| Version | Date | Numéro de référence | Version figée (SHA-256 du fichier) |
|---|---|---|---|
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

## Les messages de l'auteur

Toute communication de l'auteur est signée avec la même clé. Pour la vérifier : dans Kerckhoffs, « Vérifier ma version », puis « Vérifier un message de l'auteur ». Un message sans signature valide ne vient pas de l'auteur.

---

# Kerckhoffs releases

Every official release is signed by the author of Kerckhoffs. The table above is the reference: if the fingerprint shown in your app ("Vérifier ma version") differs from the one on this page at the official address, it is not an official release. The app never updates itself: a new release is only announced, and is downloaded only when you ask for it. It is then checked file by file against the author's signature and refused if anything differs; it replaces yours only if you tap "Utiliser". The frozen single-file version (`telecharger/`) never updates itself and is signed with the same Ed25519 key (`cle-publique.pem`). Verify with `node outils/verifier.mjs`, or with `sha256sum -c` and `openssl pkeyutl -verify` as shown above.
