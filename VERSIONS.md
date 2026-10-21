# Versions de Kerckhoffs

*English below.*

Chaque version officielle est signée par l'auteur de Kerckhoffs. Cette liste est la référence : si l'empreinte affichée dans votre application (« Vérifier ma version ») n'est pas celle de cette page, à l'adresse officielle, ce n'est pas une version officielle.

| Version | Date | Empreinte de l'application | Version figée (SHA-256 du fichier) |
|---|---|---|---|
| 0.5.0 | 2026-10-21 | `E4DD-3257-23C3-06EB` | `192685a6c3ea41bb5a5f148d77dafb6a38f36c0ec45791b0356a0f2866859610` |

## Ce que vous n'avez pas à faire

Une fois votre version vérifiée, vous n'avez plus rien à faire : avant chaque mise à jour, l'application vérifie elle-même la signature de la nouvelle version, fichier par fichier. Si un seul octet a été changé par quelqu'un d'autre que l'auteur, la mise à jour est refusée et un bandeau rouge vous prévient.

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

L'empreinte de l'application est le début du SHA-256 de `empreintes.txt`, en quatre groupes.

---

# Kerckhoffs releases

Every official release is signed by the author of Kerckhoffs. The table above is the reference: if the fingerprint shown in your app ("Vérifier ma version") differs from the one on this page at the official address, it is not an official release. Before every update, the installed app checks the new release's signature file by file and refuses it if anything differs. The frozen single-file version (`telecharger/`) never updates itself and is signed with the same Ed25519 key (`cle-publique.pem`). Verify with `node outils/verifier.mjs`, or with `sha256sum -c` and `openssl pkeyutl -verify` as shown above.
