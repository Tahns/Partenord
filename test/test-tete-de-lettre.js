const T = require('../tete-de-lettre.js');
const C = require('../conciliation.js');
const L = require('../lettre.js');
const fs = require('fs');
const assert = require('assert');

// Destinataire retrouvé dans le texte du courrier
assert.equal(T.destinataireDepuisTexte('Lomme, le 14 septembre 2026 ... Olivier CAREMELLE Maire de Lomme'),
  'Monsieur Olivier CAREMELLE\nMaire de Lomme\n72 avenue de la République\nBP 159 - 59461 LOMME Cedex');
assert.ok(T.destinataireDepuisTexte('Arnaud DESLANDES Hôtel de Ville CS 30667').startsWith('Monsieur Arnaud DESLANDES\nMaire de Lille'));
assert.equal(T.destinataireDepuisTexte('texte sans adresse connue'), '');

const texte = L.generer({
  profil: 'F', designation: 'Madame Dupont', numero: '0590000000015GDPUB', typologie: '3', lieu: 'Lille',
  criteresTextes: [], criteresLogement: [], fonction: 'maire', elueFem: false, mutation: false,
  agence: { nom: 'Lille', adresse: '2 bis rue Georges Courteline à Lille', horaires: 'du lundi au vendredi' },
  reference: '12195', date: '9 Octobre 2026', ville: 'Lille', suiviPar: 'Romy DOISNE - Commerciale d\'agence',
  signature: 'Eric COJON\nDirecteur Général\n#signature#'
});
const d = T.decouper(texte);
assert.equal(d.date, 'Lille, le 9 Octobre 2026');
assert.equal(d.reference, '12195');
assert.equal(d.objet, 'Demande de logement pour Madame Dupont - 0590000000015GDPUB');
assert.equal(d.corps[0], 'Monsieur le Maire,');
assert.ok(d.corps[d.corps.length - 1].startsWith('Je vous prie d\'agréer'));
assert.deepEqual(d.signature, ['Eric COJON', 'Directeur Général', '#signature#']);

(async () => {
  const modele = new Uint8Array(fs.readFileSync(__dirname + '/../modeles/tete-de-lettre-lille.docx'));
  const sortie = await T.remplir(modele, { destinataire: T.destinataireDepuisTexte('CAREMELLE'), texte }, C.zip);
  const f = await T.lireZip(sortie);
  const doc = Buffer.from(f['word/document.xml']).toString('utf8');
  ['Monsieur Olivier CAREMELLE', 'BP 159 - 59461 LOMME Cedex', 'Lille, le 9 Octobre 2026', 'Demande de logement pour Madame Dupont',
    'Monsieur le Maire,', 'Eric COJON', '#signature#'].forEach(t => assert.ok(doc.includes(t), t));
  ['Prénom Nom', 'Résidence - Appartement', 'CP VILLE', 'Ville, date', '>Signature<'].forEach(t => assert.ok(!doc.includes(t), t));
  assert.ok(f['word/header1.xml'] && f['word/media/image1.png'], 'en-tête et images du modèle conservés');
  if (process.env.SORTIE) fs.writeFileSync(process.env.SORTIE, sortie);
  console.log('OK tête de lettre');
})();
