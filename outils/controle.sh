#!/usr/bin/env bash
# Kerckhoffs — le contrôle à passer avant toute publication.
#
#   bash outils/controle.sh
#
# Il refuse (code de sortie 1) si :
#   - le code de Kerckhoffs contient un accès réseau ou une adresse externe non prévue ;
#   - un verrou de sécurité a été retiré ;
#   - un fichier ne correspond pas à empreintes.txt ;
#   - empreintes.txt ou la version figée ne sont pas signés par la clé de l'auteur (cle-publique.pem).
#
# Il ne demande que bash, grep, sha256sum et openssl : tous présents dans Git pour Windows.
# Si Node est installé, il lance en plus les tests des règles et la vérification complète.
set -u
cd "$(dirname "$0")/.."
echec=0
ko() { echo "REFUS : $1"; echec=1; }

# 1. Aucun appel réseau dans le code propre à Kerckhoffs.
files="app.js verification.js rules/registre.js rules/commun.js rules/pays/*.js index.html"
# Seule exception : les deux liens officiels de app.js, à ouvrir dans le navigateur (jamais une connexion de l'application).
autorises='^app.js:[0-9]+:  const (ADRESSE_OFFICIELLE = "https://kerckhoffs.app/"|PAGE_VERSIONS = "https://kerckhoffs.app/VERSIONS.md");$'
if grep -nE "fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts|https?://" $files | grep -vE "$autorises"; then
  ko "un accès réseau ou une adresse externe a été ajouté. Kerckhoffs ne doit jamais se connecter à internet."
fi
grep -nE "https?://" sw.js && ko "sw.js ne doit contenir aucune adresse externe."

# 2. Les verrous de sécurité.
grep -q "connect-src 'self'" index.html || ko "la règle connect-src 'self' a été retirée de index.html."
grep -q "url.origin !== self.location.origin" sw.js || ko "le blocage des requêtes externes a été retiré de sw.js."
grep -q "Mise à jour non demandée" sw.js || ko "sw.js doit refuser toute mise à jour que la personne n'est pas allée chercher."

grep -q "o.v < 1 || o.v > FORMAT_PROFIL" app.js || ko "les QR codes des versions précédentes ne seraient plus lus (règle FORMAT_PROFIL)."
grep -q 'id="apercuOk"' index.html || ko "la case d'autorisation avant envoi a été retirée."

# 3. Chaque fichier correspond à la liste, et la liste est signée par l'auteur.
sha256sum --quiet -c empreintes.txt || ko "un fichier ne correspond pas à empreintes.txt."
openssl pkeyutl -verify -pubin -inkey cle-publique.pem -rawin -in empreintes.txt -sigfile empreintes.sig >/dev/null 2>&1 \
  || ko "empreintes.txt n'est pas signé par la clé de l'auteur."
for f in telecharger/kerckhoffs-*.html; do
  openssl pkeyutl -verify -pubin -inkey cle-publique.pem -rawin -in "$f" -sigfile "$f.sig" >/dev/null 2>&1 \
    || ko "$f n'est pas signé par la clé de l'auteur."
done

# 4. Avec Node : les exemples des règles, et la vérification complète.
if command -v node >/dev/null 2>&1; then
  node rules/tester.js >/dev/null || ko "les règles de détection ne passent pas leurs exemples (node rules/tester.js)."
  node outils/verifier.mjs >/dev/null || ko "la vérification complète a échoué (node outils/verifier.mjs)."
fi

if [ "$echec" -ne 0 ]; then echo "Contrôle refusé."; exit 1; fi
echo "Contrôle réussi : sans internet, verrous en place, signé par l'auteur."
