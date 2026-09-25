# Réponses aux demandes de logement

Outil web pour rédiger en quelques secondes la réponse à un courrier d'élu
(maire, député…) concernant une demande de logement.

1. Glisser le courrier (PDF scanné, PDF texte ou photo) dans la page.
2. Le texte est lu (OCR en français) et l'outil repère automatiquement :
   demandeur(s) et civilité, numéro unique, typologie, commune souhaitée,
   critères (métro, rez-de-chaussée…), fonction de l'auteur du courrier.
3. Vérifier / corriger les champs : la réponse se met à jour en direct,
   avec tous les accords (Monsieur, Madame, Monsieur et Madame, Messieurs, Mesdames).
4. Copier le texte et le coller dans le PGI.

Les réglages (Affaire suivie par, signature, agences avec adresse, horaires
et communes rattachées) se font via le bouton « Réglages » et sont enregistrés
dans le navigateur.

## Confidentialité

Le courrier n'est jamais envoyé sur un serveur : la lecture (pdf.js + Tesseract.js)
et la rédaction se font entièrement dans le navigateur. Seuls les programmes de
lecture sont téléchargés depuis cdnjs / jsDelivr.

## Fichiers

- `index.html` / `app.js` : l'interface.
- `lettre.js` : extraction des informations et modèle de réponse (c'est ici qu'on modifie le texte type).
- `test/test.js` : tests (`node test/test.js`).
