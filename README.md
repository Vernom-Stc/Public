# Kerckhoffs

**Masquez vos données avant de travailler avec une IA. Aucune connexion internet.**

Kerckhoffs efface les informations personnelles d'une photo ou d'un document avant que vous l'envoyiez à ChatGPT, Claude ou une autre IA. Tout se passe sur votre téléphone ou votre ordinateur. Rien n'est envoyé nulle part.

*English summary below.*

## Deux façons de l'utiliser

**Photo rapide.** Une diapo de cours, un tableau blanc, une photo de groupe. Effacez au doigt un nom, un visage ou un logo, copiez, collez dans l'IA.

**Dossier.** Plusieurs pages, détection automatique des noms et numéros, puis export en PDF, en image allégée ou en texte seul. Un nom devient `[PERSONNE_1]`, un numéro AVS devient `[AVS_1]`. Vous lisez la réponse de l'IA avec votre original sous les yeux : vous savez qui est qui.

**Cerbère**, le gardien à trois têtes, relit avant chaque envoi ce qui reste visible et signale ce qui pourrait encore vous trahir : un nom après « Monsieur », un mot sensible, un code-barres, une date oubliée. Il propose, vous décidez. Ses règles sont dans `rules/cerbere.js`.

Dans les deux cas, vous pouvez aussi **alléger** l'image sans rien masquer : elle sera plus légère à envoyer et contiendra moins d'informations inutiles.

## Pourquoi vous pouvez lui faire confiance

Lisez [CONFIANCE.md](CONFIANCE.md) ([English: TRUST.md](TRUST.md)). En bref :

- **Faites le test du mode avion** : Kerckhoffs fonctionne entièrement sans connexion.
- **Double verrou** : la page interdit au navigateur de contacter un autre site (règle de sécurité CSP), et le service worker refuse toute requête vers l'extérieur.
- **Tout le code est public**, y compris les bibliothèques utilisées, copiées dans `vendor/`.
- **Un contrôle automatique** bloque toute modification qui ajouterait un accès à internet (`.github/workflows/sans-internet.yml`).

## Ce que Kerckhoffs ne fait pas à votre place

La détection automatique peut rater un élément, surtout sur une photo floue ou une écriture manuscrite. **Relisez toujours** le résultat avant de l'envoyer. Pour des données de patients ou de clients, la responsabilité reste celle du professionnel.

## Utiliser Kerckhoffs

Ouvrez l'adresse web de Kerckhoffs (GitHub Pages) sur votre téléphone. Une fois la page chargée, elle reste disponible hors ligne. Vous pouvez l'ajouter à votre écran d'accueil (« Ajouter à l'écran d'accueil » dans le menu du navigateur).

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

Kerckhoffs hides personal data in a photo or document before you send it to an AI. Everything happens on your device; nothing is sent anywhere. Use **Quick photo** to erase anything with your finger and paste the image into an AI, or **Folder** for multi-page documents with automatic detection of names and numbers, exported as PDF, lightened image or plain text. Try airplane mode: it all still works. See [TRUST.md](TRUST.md). Provided as is under the Apache 2.0 license; copy and adapt it freely. To add your country's rules, see [rules/LISEZMOI.md](rules/LISEZMOI.md).
