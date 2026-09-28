# Réponses aux demandes de logement et pouvoirs de conciliation

Deux onglets :

- **Demandes de logement** : réponse aux courriers d'élus ou de demandeurs (ci-dessous).
- **Conciliations (pouvoir)** : déposer la convocation du conciliateur de justice ;
  l'outil repère le demandeur, la date, l'heure et le lieu de la réunion, et produit
  le pouvoir au format Word (logo Partenord Habitat, « #signature# » à la place de la
  signature). Le mandataire (Hicham KHALFI ou Cathy CLAIRON) se choisit dans la liste.

Outil web pour rédiger en quelques secondes la réponse à un courrier d'élu
(maire, député…) concernant une demande de logement.

1. Glisser un ou plusieurs courriers (PDF scanné, PDF texte ou photo) dans la page :
   chacun apparaît dans une liste, garde ses propres champs et est marqué « ✓ copié » une fois la réponse copiée.
2. Le texte est lu (OCR en français) et l'outil repère automatiquement :
   demandeur(s) et civilité, numéro unique, typologie, commune souhaitée,
   critères (métro, rez-de-chaussée…), fonction de l'auteur du courrier.
3. Vérifier / corriger les champs : la réponse se met à jour en direct,
   avec tous les accords (Monsieur, Madame, Monsieur et Madame, Messieurs, Mesdames).
4. Copier le texte et le coller dans le PGI.

Les réglages (Affaire suivie par, signature, agences avec adresse, horaires
et communes rattachées) se font via le bouton « Réglages » et sont enregistrés
dans le navigateur. Le bouton « Exporter les réglages » produit un fichier à
transmettre aux collègues, qui l'ouvrent avec « Importer des réglages… ».

## Confidentialité

Le courrier n'est jamais envoyé sur un serveur : la lecture (pdf.js + Tesseract.js)
et la rédaction se font entièrement dans le navigateur. Les programmes de lecture
et le dictionnaire français sont hébergés avec le site (dossier `vendor/`) : aucun
service externe n'est appelé, et la politique de sécurité de la page (CSP)
interdit au navigateur toute connexion vers un autre site.

## Mise en ligne (GitHub Pages)

1. Dans le dépôt GitHub : *Settings → Pages → Build and deployment → Source* : choisir **GitHub Actions**.
2. Fusionner les modifications dans la branche `main` : le workflow
   `.github/workflows/static.yml` lance les tests puis publie le site
   (uniquement les fichiers du site : `index.html`, les scripts, les logos, `modeles/` et `vendor/`).
3. L'adresse du site s'affiche dans l'onglet *Actions* (étape « Déployer ») et dans *Settings → Pages*.

La page est marquée `noindex` : elle n'apparaît pas dans les moteurs de recherche.

## Fichiers

- `index.html` / `app.js` : l'interface.
- `lettre.js` : extraction des informations et modèle de réponse (c'est ici qu'on modifie le texte type).
- `vendor/` : pdf.js 3.11.174, Tesseract.js 5.1.1 et données françaises (licence Apache 2.0).
- `conciliation.js` / `conciliation-app.js` : onglet Conciliations (extraction, texte du pouvoir, fichier Word).
- `modeles/logo-partenord-habitat.png` : logo placé en haut du pouvoir.
- `test/test.js`, `test/test-conciliation.js` : tests (`node test/test.js && node test/test-conciliation.js`).
  Les exemples tirés de courriers réels y sont **anonymisés** : ne jamais y mettre de vrais noms ou numéros.
