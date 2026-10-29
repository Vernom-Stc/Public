#!/usr/bin/env bash
# Kerckhoffs — enregistrer une modification (commit) selon les règles de publication.
#
#   bash outils/commit.sh "message"
#
# Règles :
#   - auteur et enregistreur : « L'auteur de Kerckhoffs », adresse fictive (jamais un vrai nom, jamais un vrai e-mail) ;
#   - date seule, à 00:00 en heure universelle : l'heure réelle ne doit jamais révéler les heures d'activité ni le fuseau horaire ;
#   - aucune ligne ajoutée automatiquement (pas de lien de session, pas de signature d'outil).
set -eu
cd "$(dirname "$0")/.."
[ $# -ge 1 ] || { echo "Usage : bash outils/commit.sh \"message\""; exit 1; }
jour="$(date -u +%Y-%m-%d)T00:00:00+00:00"
export GIT_AUTHOR_NAME="L'auteur de Kerckhoffs" GIT_AUTHOR_EMAIL="auteur@kerckhoffs.invalid"
export GIT_COMMITTER_NAME="L'auteur de Kerckhoffs" GIT_COMMITTER_EMAIL="auteur@kerckhoffs.invalid"
export GIT_AUTHOR_DATE="$jour" GIT_COMMITTER_DATE="$jour" TZ=UTC
git -c commit.gpgsign=false commit -m "$1"
