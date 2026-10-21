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

### Test 3 : la fiche du store (application Android, à venir)

Sur le Google Play Store, ouvrez la fiche de Kerckhoffs, puis « À propos de l'appli » et « Autorisations ». Vous ne trouverez **pas** « Accès complet au réseau ». Sans cette autorisation, Android interdit à l'application de se connecter à internet. C'est le téléphone lui-même qui l'empêche, pas une promesse de notre part.

## Ce qui sort de votre téléphone, et ce qui n'en sort pas

| | Quitte votre téléphone ? |
|---|---|
| Vos photos et documents d'origine | **Non, jamais** |
| Les noms et termes que vous tapez pour les masquer | **Non, jamais** |
| Le PDF masqué | **Seulement si vous l'envoyez vous-même** à une IA |

Kerckhoffs s'arrête au moment où le PDF masqué est créé. Si vous l'envoyez ensuite à ChatGPT, Claude ou une autre IA, c'est vous qui le faites, après l'avoir vu à l'écran.

## Ce qui reste sur votre téléphone

**Le seul fichier que Kerckhoffs écrit sur votre téléphone, c'est le PDF déjà masqué.** Même s'il partait un jour sur internet, il ne contiendrait pas vos données.

- **Les photos prises avec le bouton « Prendre une photo »** restent dans la mémoire de Kerckhoffs et disparaissent à la fermeture. Sur iPhone, elles ne sont pas enregistrées dans la galerie. Sur Android, cela dépend de l'appareil photo du téléphone : vérifiez-le une fois dans votre galerie.
- **Les métadonnées cachées** des photos (lieu GPS, date, modèle du téléphone) sont supprimées de tout ce que Kerckhoffs exporte.
- **Application mobile, à venir** : elle bloquera aussi les captures d'écran et cachera son contenu dans la liste des applications ouvertes.
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

*Kerckhoffs est fourni tel quel, sous licence Apache 2.0. Copiez-le, adaptez-le, partagez-le librement.*
