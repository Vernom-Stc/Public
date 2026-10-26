# Règles de détection

*English below.*

Tout ce que Kerckhoffs sait reconnaître tout seul est écrit ici, en clair, dans des fichiers courts que chacun peut lire.

| Fichier | Contenu |
|---|---|
| `registre.js` | Le format d'une règle, et rien d'autre |
| `commun.js` | Ce qui se reconnaît partout : e-mails, longs numéros |
| `pays/ch.js` | Suisse : AVS, IBAN, adresses, codes postaux, téléphones |
| `pays/_modele.js` | Le modèle à copier pour ajouter un pays |
| `tester.js` | Vérifie toutes les règles grâce à leurs exemples |

Les noms et prénoms ne sont pas ici : rien dans leur forme ne permet de les reconnaître à coup sûr. L'utilisateur les écrit lui-même dans « Réglages ».

## Ajouter un pays en quatre étapes

1. **Copiez** `pays/_modele.js` sous le code ISO du pays, par exemple `pays/in.js` pour l'Inde.
2. **Remplissez** le code, le nom et les règles. Chaque règle reconnaît **une forme** : un numéro d'identité, un code postal, un téléphone… Donnez des **exemples** : ceux qui doivent être trouvés (`trouve`) et ceux qui ne doivent pas l'être (`ignore`). Utilisez uniquement des exemples fictifs.
3. **Déclarez** le fichier à deux endroits : une ligne `<script src="rules/pays/in.js"></script>` dans `index.html`, et une ligne `"rules/pays/in.js",` dans la liste `FILES` de `sw.js`.
4. **Vérifiez** : `node rules/tester.js`. Le même test est relancé avant chaque envoi d'une version (`outils/controle.sh`).

Le pays apparaît alors dans « Réglages → Pays des documents ».

**Règle d'or** : une règle ne fait que reconnaître du texte. Elle ne doit jamais rien charger ni envoyer. Le contrôle automatique refuse toute règle qui essaierait.

---

# Detection rules

Everything Kerckhoffs can recognise on its own is written here, in plain sight, in short files anyone can read: `registre.js` (the rule format), `commun.js` (e-mails, long numbers), `pays/ch.js` (Switzerland), `pays/_modele.js` (template), `tester.js` (checks every rule against its examples). Names are not detected automatically; users type them in Settings.

## Add a country in four steps

1. **Copy** `pays/_modele.js` using the country's ISO code, e.g. `pays/in.js` for India.
2. **Fill in** the code, name and rules. Each rule recognises **one pattern** (ID number, postcode, phone…). Give **examples** that must be found (`trouve`) and must not be (`ignore`). Use fictitious examples only.
3. **Declare** the file in `index.html` (`<script src="rules/pays/in.js"></script>`) and in the `FILES` list of `sw.js`.
4. **Check**: `node rules/tester.js`. The same test runs before every release is pushed (`outils/controle.sh`).

**Golden rule**: a rule only recognises text. It must never load or send anything.
