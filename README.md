# Kerckhoffs

**Masquez vos données avant de travailler avec une IA. Aucune connexion internet.**

Kerckhoffs efface les informations personnelles d'une photo ou d'un document avant que vous l'envoyiez à ChatGPT, Claude ou une autre IA. Tout se passe sur votre téléphone ou votre ordinateur. Rien n'est envoyé nulle part.

*English summary below.*

## Comment l'utiliser

**Photographiez un document**, ou **importez-le** : une photo déjà prise, une image ou un PDF, une ou plusieurs pages. Kerckhoffs repère tout seul les noms et les numéros. Un nom devient `[PERSONNE_1]`, un numéro AVS devient `[AVS_1]`. Vous relisez, vous complétez au doigt (pinceau ou rectangle), puis vous envoyez en image, en PDF, en image allégée ou en texte seul. Vous lisez la réponse de l'IA avec votre original sous les yeux : vous savez qui est qui.

Tant que le document n'est pas validé, l'écran affiche en filigrane « ORIGINAL · NON MASQUÉ · NE PAS ENVOYER ».

**Remove Before Flight**, le contrôle avant envoi, relit ce qui reste visible et signale ce qui pourrait encore vous identifier : un nom après « Monsieur », un mot sensible, un code-barres, une date oubliée, ce qui a la forme d'un identifiant, et les zones d'écriture que la lecture n'a pas su lire (texte minuscule, flou ou manuscrit), en orange. Il prévient aussi quand plusieurs informations restent visibles ensemble (un code postal, un âge, le sexe, une information de santé) : réunies, elles suffisent souvent à retrouver quelqu'un. Il propose, vous décidez. Ses règles sont dans `rules/cerbere.js`.

**Pour aller plus loin dans la détection :**
- **Les identifiants sont reconnus à leur forme**, dans n'importe quel pays : lettres et chiffres mêlés, groupes de chiffres, séparateurs répétés (voir `K.formeIdentifiant` dans `rules/registre.js`). Une forme très typique est masquée d'office, une forme douteuse est signalée.
- **« Tous les pareils »** cherche séparément chaque information de la zone encadrée, et montre ce qu'il a trouvé : on passe de l'un à l'autre avec les flèches ‹ ›.
- **« Rechercher ici »** relit de près la zone affichée, sur la photo en pleine résolution : utile pour les petits caractères.
- **Le dernier balayage** cherche partout ce qui a déjà été masqué une fois. Il est automatique en mode strict.

Après la validation, une courte animation montre les zones masquées qui tombent comme du sable : ce qui est masqué n'existe plus. Elle se coupe d'un toucher, sur l'écran de travail, et disparaît d'elle-même si le téléphone est réglé pour réduire les animations.

**Le mode strict**, pour les professionnels, rend cette vérification obligatoire : chaque point doit être traité, puis un aperçu final montre exactement ce qui va partir.

**La mention en bas du document.** Chaque document envoyé porte en bas une petite bande : « Masqué avec Kerckhoffs · non contrôlé en mode strict », ou « … contrôlé en mode strict ». Seul un document contrôlé en mode strict peut partir sans cette mention. Elle ne contient ni date, ni appareil, ni numéro.

## Pourquoi vous pouvez lui faire confiance

Lisez [CONFIANCE.md](CONFIANCE.md) ([English: TRUST.md](TRUST.md)). En bref :

- **Faites le test du mode avion** : Kerckhoffs fonctionne entièrement sans connexion.
- **Double verrou** : la page interdit au navigateur de contacter un autre site (règle de sécurité CSP), et le service worker refuse toute requête vers l'extérieur.
- **Tout le code est public**, y compris les bibliothèques utilisées, copiées dans `vendor/`.
- **Un contrôle automatique** bloque toute modification qui ajouterait un accès à internet (`outils/controle.sh`, lancé avant chaque envoi d'une version et par `.forgejo/workflows/sans-internet.yml`).
- **Chaque version est signée** par l'auteur, et l'application refuse toute mise à jour non signée. Pour les usages sensibles, une **version figée** en un seul fichier signé ne se met jamais à jour toute seule. Voir [VERSIONS.md](VERSIONS.md).

## Ce que Kerckhoffs ne fait pas à votre place

La détection automatique peut rater un élément, surtout sur une photo floue ou une écriture manuscrite. **Relisez toujours** le résultat avant de l'envoyer. Pour des données de patients ou de clients, la responsabilité reste celle du professionnel.

## Utiliser Kerckhoffs

Ouvrez l'adresse officielle de Kerckhoffs, **kerckhoffs.app**, sur votre téléphone. Le code est public : l'adresse du dépôt officiel est indiquée sur kerckhoffs.app. Une fois la page chargée, elle reste disponible hors ligne. Vous pouvez l'ajouter à votre écran d'accueil (« Ajouter à l'écran d'accueil » dans le menu du navigateur).

Pour la lancer sur votre ordinateur :

```
python3 -m http.server 8000
```

puis ouvrez `http://localhost:8000`.

## Adapter Kerckhoffs

Le projet est fourni **tel quel**. Il n'y a pas d'engagement de maintenance. Copiez-le, adaptez-le à votre pays, à votre métier ou à votre organisation, y compris dans une version fermée : la licence Apache 2.0 le permet.

- **Ajouter votre pays** : chaque pays a son fichier dans `rules/pays/` (la Suisse : `rules/pays/ch.js`). Copiez `rules/pays/_modele.js`, remplissez-le, et vérifiez avec `node rules/tester.js`. Tout est expliqué dans [rules/LISEZMOI.md](rules/LISEZMOI.md).
- La langue de lecture des textes est le français (`vendor/tesseract/lang/fra.traineddata.gz`). D'autres langues sont disponibles dans les paquets `@tesseract.js-data`.
- Après chaque modification, changez `VERSION` dans `sw.js`.

## Soutenir le projet

Si Kerckhoffs vous est utile, un don en Bitcoin ou par Lightning fait plaisir. *(Adresse à venir.)*

## Licence et bibliothèques

Kerckhoffs est distribué sous licence [Apache 2.0](LICENSE). Il utilise :

- [Tesseract.js](https://github.com/naptha/tesseract.js) pour lire le texte (Apache 2.0)
- [PDF.js](https://github.com/mozilla/pdf.js) pour ouvrir les PDF (Apache 2.0)
- [jsPDF](https://github.com/parallax/jsPDF) pour créer les PDF (MIT)

Le nom rend hommage à Auguste Kerckhoffs, qui écrivait en 1883 dans *La Cryptographie militaire* qu'un système sûr doit le rester même si l'ennemi en connaît tout le fonctionnement. C'est exactement l'idée de l'open source.

> « 1883. Il faut qu'il n'exige pas le secret, et qu'il puisse sans inconvénient tomber entre les mains de l'ennemi. Kerckhoffs. »

---

## English summary

Kerckhoffs hides personal data in a photo or document before you send it to an AI. Everything happens on your device; nothing is sent anywhere. Take a photo or import a document (image or PDF, one or more pages): names and numbers are detected automatically, you finish with your finger, then export as image, PDF, lightened image or plain text. A check before sending flags what could still identify someone; strict mode, for professionals, makes it mandatory. Exports carry a small footer, “Masqué avec Kerckhoffs”, stating whether strict mode was used; only strict-mode documents may omit it. Try airplane mode: it all still works. See [TRUST.md](TRUST.md). Provided as is under the Apache 2.0 license; copy and adapt it freely. To add your country's rules, see [rules/LISEZMOI.md](rules/LISEZMOI.md).
