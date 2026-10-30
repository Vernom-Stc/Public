# Pourquoi vous pouvez faire confiance à Kerckhoffs

*Une page pour tout le monde, sans jargon.*

## En une phrase

**Kerckhoffs ne se connecte jamais à internet.** Vos documents restent sur votre téléphone. Ce qui part vers l'IA, c'est uniquement le PDF masqué que vous avez vérifié et que vous choisissez d'envoyer vous-même.

## Ne nous croyez pas : vérifiez

Vous n'avez pas besoin de connaissances techniques pour vous en assurer.

### Test 1 : le mode avion (30 secondes)

1. Activez le **mode avion** sur votre téléphone. Coupez aussi le Wi-Fi.
2. Ouvrez Kerckhoffs.
3. Prenez une photo d'un document, masquez, exportez le PDF.

**Tout fonctionne.** Une application qui aurait besoin d'envoyer vos données ailleurs ne pourrait pas faire son travail sans connexion.

### Test 2 : le vieux téléphone (pour les plus prudents)

1. Prenez un ancien téléphone, sans carte SIM.
2. Installez Kerckhoffs (il faut internet une seule fois, pour l'installation).
3. Coupez le Wi-Fi **définitivement**.
4. Utilisez ce téléphone uniquement pour masquer vos documents.

Ce téléphone devient une machine fermée : aucun moyen physique d'envoyer quoi que ce soit. Vous transférez ensuite le PDF masqué par câble vers votre ordinateur.

### Test 3 : la signature de l'auteur

À l'ouverture, touchez « Vérifier avec un autre appareil » (ou, sur l'accueil, « Plus », puis « Vérifier ma version »). L'écran affiche un numéro de référence, par exemple `9A71-FC92-65A0-DC72`. Il doit être identique à celui publié pour cette version dans [VERSIONS.md](VERSIONS.md), à l'adresse officielle.

Cette version ne changera plus jamais toute seule, avec ou sans internet, tant que vous ne l'effacez pas. Si une nouvelle version existe, Kerckhoffs vous le signale ; c'est vous qui allez la chercher. Elle est alors vérifiée fichier par fichier avant de vous être proposée. Si quelqu'un d'autre que l'auteur a changé un seul octet, par exemple en prenant le contrôle du dépôt, la mise à jour est refusée et un bandeau rouge vous prévient.

Une limite, dite franchement : sur le web, c'est le navigateur qui a le dernier mot sur les mises à jour. Pour les usages sensibles (avocats, médecins, administrations), utilisez donc la **version figée** : un seul fichier signé, à télécharger depuis l'accueil, qui s'ouvre d'un double-clic, fonctionne sans internet et ne se met jamais à jour tout seul.

### À chaque ouverture : le code vérifié, et votre image

À chaque ouverture, avant de vous laisser entrer, Kerckhoffs recalcule l'empreinte de ses propres fichiers, gardés sur votre appareil, et la compare à la liste signée par l'auteur. Il le fait **sans aucune connexion** : la clé publique de l'auteur est inscrite dans son code, et la signature est gardée avec l'application. Si un seul fichier a été abîmé ou modifié, le logo ne s'ouvre pas et un message rouge vous prévient.

Une limite, dite franchement : un code qui se vérifie lui-même ne peut pas tout prouver. Quelqu'un qui remplacerait toute l'application pourrait aussi remplacer le vérificateur, qui dirait alors « vérifié » à tort. Trois protections couvrent ce cas :

- **Votre image.** Au premier lancement, vous choisissez une petite image (et un mot, si vous voulez). Elle s'affiche ensuite sous le logo, à chaque ouverture. Votre navigateur la range dans le tiroir de l'adresse de Kerckhoffs, qu'aucune autre adresse ne peut ouvrir : une fausse application, forcément ailleurs, ne peut pas la connaître. **Si vous ne voyez pas votre image, ce n'est pas votre Kerckhoffs.** Elle ne vous est redemandée que si vous avez effacé les données de votre navigateur.
- **Le gardien.** Aucune nouvelle version ne s'installe sans que vous alliez la chercher, et elle est refusée si elle n'est pas signée par l'auteur.
- **Un deuxième appareil.** « Vérifier avec un autre appareil » montre le numéro de référence et un QR code vers la liste officielle des versions. Scannez-le avec un autre téléphone (celui d'un proche, ou un appareil neuf), vérifiez que l'adresse ouverte est bien l'adresse officielle, et comparez les deux numéros. Un appareil corrompu ne peut pas tromper un autre appareil sain.

### Test 4 : qui est l'auteur de Kerckhoffs ?

Kerckhoffs n'a pas de visage, et c'est voulu. Son auteur se reconnaît à une seule chose : il est le seul à pouvoir signer avec le sceau de Kerckhoffs.

Si quelqu'un prétend être l'auteur, mettez-le au défi :

1. Choisissez une phrase, avec la date du jour, par exemple « Kerckhoffs, 3 novembre 2026, pomme verte ».
2. Demandez-lui de vous la rendre signée avec le sceau.
3. Collez le message signé dans Kerckhoffs, à « Vérifier un message de l'auteur ».

Si la signature est valide, c'est lui. Sinon, ce n'est pas l'auteur, quoi qu'il dise. Comme c'est vous qui choisissez la phrase et la date, personne ne peut ressortir une ancienne signature trouvée ailleurs. Ce défi prouve qui détient le sceau, sans rien révéler de l'identité de l'auteur. Si le sceau change un jour, le changement est annoncé par un message signé avec l'ancien sceau, et le défi continue avec le nouveau.

## Ce qui sort de votre téléphone, et ce qui n'en sort pas

| | Quitte votre téléphone ? |
|---|---|
| Vos photos et documents d'origine | **Non, jamais** |
| Les noms et termes que vous tapez pour les masquer | **Non, jamais** |
| Le PDF masqué | **Seulement si vous l'envoyez vous-même** à une IA |

Kerckhoffs s'arrête au moment où le PDF masqué est créé. Si vous l'envoyez ensuite à ChatGPT, Claude ou une autre IA, c'est vous qui le faites, après l'avoir vu à l'écran.

## Ce qui reste sur votre téléphone

**Le seul fichier que Kerckhoffs écrit sur votre téléphone, c'est le PDF déjà masqué.** Même s'il partait un jour sur internet, il ne contiendrait pas vos données.

- **Les photos prises avec la caméra de Kerckhoffs** restent dans sa mémoire de travail et disparaissent à la fermeture. Elles ne passent jamais par la galerie. Si vous refusez l'accès à la caméra, c'est l'appareil photo du téléphone qui s'ouvre, et lui peut ranger la photo dans la galerie.
- **Les métadonnées cachées** des photos (lieu GPS, date, modèle du téléphone) sont supprimées de tout ce que Kerckhoffs exporte.
- **Captures d'écran** : Kerckhoffs ne peut pas les empêcher. Pendant le travail, l'image porte donc un tampon « ORIGINAL · NON MASQUÉ · NE PAS ENVOYER » : une capture de l'original le montre toujours. Seule la photocopie exportée est propre.
- **Kerckhoffs n'existe sur aucun store.** Une seule adresse officielle : si vous l'avez trouvé sur l'App Store ou Google Play, c'est une copie.
- **Attention aux documents importés** : si vous importez une photo ou un PDF déjà présent sur votre téléphone, l'original reste là où il était, et il est peut-être déjà sauvegardé dans le cloud. Pour un document sensible, photographiez-le plutôt directement depuis Kerckhoffs.

Kerckhoffs ne contrôle pas votre téléphone lui-même. Si vous voulez une garantie totale, utilisez le vieux téléphone sans connexion du test 2.

## Pourquoi « open source » est une garantie

Le code de Kerckhoffs est **public**. Tout le monde peut le lire : informaticiens, journalistes, écoles, associations de consommateurs. Si l'application envoyait vos données en cachette, ça se verrait, et ça se saurait.

Vous n'avez pas besoin de lire le code vous-même. Il suffit que d'autres puissent le faire.

## Ce que Kerckhoffs ne fait pas à votre place

Soyons honnêtes : aucun outil n'est parfait.

- La détection automatique peut **rater** un nom ou un numéro, surtout sur une photo floue ou une écriture à la main.
- **Relisez toujours** chaque page avant d'exporter, et masquez à la main ce qui reste.
- Un document peut révéler qui vous êtes même sans votre nom (une commune, un employeur, un montant très précis). Masquez aussi ce que vous jugez trop parlant.

Kerckhoffs vous aide beaucoup. La dernière vérification, c'est vous.

---

*Kerckhoffs est fourni tel quel, sous licence GNU AGPL 3.0 ou ultérieure. Copiez-le, adaptez-le, partagez-le librement ; une version modifiée proposée à d'autres publie aussi son code.*
