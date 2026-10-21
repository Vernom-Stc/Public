# Versions de Kerckhoffs

*English below.*

Chaque version officielle est signée par l'auteur de Kerckhoffs. Cette liste est la référence : si l'empreinte affichée dans votre application (« Vérifier ma version ») n'est pas celle de cette page, à l'adresse officielle, ce n'est pas une version officielle.

| Version | Date | Empreinte de l'application | Version figée (SHA-256 du fichier) |
|---|---|---|---|
| 0.5.6 | 2026-10-21 | `05C1-F377-79F0-A06E` | `f9b311d5425985f9d3832fe6d83b033511aa63ad4ae87cf7b17dc0495995565f` |
| 0.5.5 | 2026-10-21 | `C0CC-82AE-7040-7873` | `947c07a4972f92aa9d853d2e9a7d0c0dbec5d0d2639538f950d355d885a8a616` |
| 0.5.4 | 2026-10-21 | `472A-B65C-0F24-E20B` | `f81d5c155161d628cef47db4cf78634c4ca1c032fe3ba89f007515f53bcc31bd` |
| 0.5.3 | 2026-10-21 | `C8EC-7BE6-6528-1CC8` | `08cf8bf62ed5d80ce9918881c94a16617e229c824b74386b434728e6d0a9acbd` |
| 0.5.2 | 2026-10-21 | `7507-C90C-1735-1BD3` | `2dc92381766c4b58fb523a8baf3eff9d1ce826eae8b1446765381495527204a3` |
| 0.5.1 | 2026-10-21 | `02A3-CA64-7FD8-9C84` | `03eef47846020b5bb31b87263548346a69b57aa5680d2e9b3b94b943e37571d0` |
| 0.5.0 | 2026-10-21 | `E4DD-3257-23C3-06EB` | `192685a6c3ea41bb5a5f148d77dafb6a38f36c0ec45791b0356a0f2866859610` |

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

L'empreinte de l'application est le début du SHA-256 de `empreintes.txt`, en quatre groupes.

---

# Kerckhoffs releases

Every official release is signed by the author of Kerckhoffs. The table above is the reference: if the fingerprint shown in your app ("Vérifier ma version") differs from the one on this page at the official address, it is not an official release. The app never updates itself: a new release is only announced, and is downloaded only when you ask for it. It is then checked file by file against the author's signature and refused if anything differs; it replaces yours only if you tap "Utiliser". The frozen single-file version (`telecharger/`) never updates itself and is signed with the same Ed25519 key (`cle-publique.pem`). Verify with `node outils/verifier.mjs`, or with `sha256sum -c` and `openssl pkeyutl -verify` as shown above.
