const L = require('../lettre.js');
const assert = require('assert');
const courrier = `ville de
Lille  Lille, le 18 SEP. 2026
LE MAIRE HOTEL DE VILLE
Monsieur Eric COJON Directeur Général Partenord Habitat 828 rue de Cambrai B.P. 309 59020 Lille Cedex
Monsieur le Directeur Général,
Mon attention a été attirée sur la demande de logement de
Monsieur et Madame Moutchou, domiciliés 236 bis/50 rue du Faubourg
des Postes à Lille.
Les intéressés ont déposé un dossier, enregistré sous le numéro
départemental unique 059042380857SGDPUB, en vue de l'attribution
d'un appartement de type 4 à Lille, plus adapté à l'état de santé de
Monsieur et proche d'une station de métro.
En effet, leur habitation, située au 12ème étage, présente un risque
important pour ce dernier. Par ailleurs, les deux enfants du couple,
En outre, l'état de santé de Monsieur Moutchou ne lui permet plus d'accéder à la salle de bain.
Je vous prie de croire, Monsieur le Directeur Général, à l'assurance de mes sentiments les meilleurs.
Arnaud DESLANDES`;
const r = L.extraire(courrier);
console.log({...r, texte: undefined});
assert.equal(r.designation, 'Monsieur et Madame Moutchou');
assert.equal(r.profil, 'MF');
assert.equal(r.numero, '0590423808575GDPUB');
assert.equal(r.typologie, '4');
assert.equal(r.lieu, 'Lille');
assert.equal(r.fonction, 'maire');
assert.ok(r.criteres.includes('metro'));

const attendu = `Lille, le 25 Septembre 2026


Nos réf. : 12195
Affaire suivie par : Romy DOISNE -  Commerciale d'agence 

Objet : Demande de logement pour Monsieur et Madame Moutchou - 0590423808575GDPUB


Monsieur le Maire,

J'ai bien pris connaissance de votre courrier par lequel vous avez appelé mon attention sur la situation de Monsieur et Madame Moutchou dans le cadre de leur demande de logement.

Après examen de leur requête, je vous confirme que Monsieur et Madame Moutchou ont exprimé le souhait d'obtenir un logement de type 4 à Lille près d'une station de métro.

Conformément aux procédures en vigueur, leur dossier sera présenté à la Commission d'Attribution des Logements et d'Examen de l'Occupation des Logements ( CALEOL ) de l'agence de Lille dès qu'un logement correspondant à leurs critères de recherche sera disponible.

Le cas échéant, Monsieur et Madame Moutchou seront directement contactés par l'un de nos conseillers commerciaux afin de convenir d'un rendez-vous.

Monsieur et Madame Moutchou ont également la possibilité de se rapprocher de l'accueil de l'agence de Lille, situé au 2 bis rue Georges Courteline à Lille, ouverte du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00, pour tout renseignement relatif au suivi de leur demande.

Je vous prie d'agréer, Monsieur le Maire, l'expression de ma considération distinguée.


Eric COJON
Directeur Général
#signature#`;
const out = L.generer({ ...r, date: '25 Septembre 2026', reference: '12195', suiviPar: "Romy DOISNE -  Commerciale d'agence ",
  criteresTextes: ["près d'une station de métro"],
  agence: { nom: 'Lille', adresse: '2 bis rue Georges Courteline à Lille', horaires: 'du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00' } });
assert.equal(out, attendu);

// Accords
const f = L.generer({ designation: 'Madame Durand', profil: 'F', typologie: '3', lieu: 'Roubaix', fonction: 'depute', elueFem: true, agence: { nom: 'Roubaix' } });
assert.ok(f.includes('Madame Durand sera directement contactée'));
assert.ok(f.includes('de sa demande de logement'));
assert.ok(f.includes('son dossier sera'));
assert.ok(f.includes('à ses critères'));
assert.ok(f.includes('Madame Durand a exprimé'));
assert.ok(f.includes('Madame la Députée,'));
const ff = L.generer({ designation: 'Mesdames Martin', profil: 'FF', agence: {} });
assert.ok(ff.includes('seront directement contactées'));

// Autres formes
const e2 = L.extraire("la situation de M. Jean DUPONT et Mme Marie MARTIN qui souhaitent un T3 ou T4 sur Villeneuve d'Ascq. Député du Nord");
console.log(e2.designation, e2.profil, e2.typologie, e2.lieu, e2.fonction);
assert.equal(e2.designation, 'Monsieur Jean DUPONT et Madame Marie MARTIN');
assert.equal(e2.typologie, '3 ou 4');
assert.equal(e2.lieu, "Villeneuve d'Ascq");
assert.equal(e2.fonction, 'depute');
const e3 = L.extraire("Madame Fatima BENALI, domiciliée 3 rue X à Tourcoing, sollicite une mutation vers un F2 à Tourcoing. N° 059 1122 33 44556 ABCDE");
console.log(e3.designation, e3.profil, e3.typologie, e3.lieu, e3.mutation, e3.numero);
assert.equal(e3.profil, 'F'); assert.equal(e3.typologie, '2'); assert.equal(e3.lieu, 'Tourcoing'); assert.ok(e3.mutation);

// L'élu, le destinataire et le signataire ne sont pas pris pour le demandeur
const e4 = L.extraire(`ASSEMBLÉE NATIONALE
Madame Sophie DURAND Députée du Nord
Monsieur Eric COJON
Directeur Général Partenord Habitat
Monsieur le Directeur Général,
Je me permets d'appeler votre attention sur la situation de Madame Fatima BENALI, domiciliée 3 rue des Lilas à Roubaix.
Madame BENALI a déposé une demande (numéro unique 059 12 23 34 45 56 ABCDE) pour un T3 à Roubaix, en rez-de-chaussée.`,
  { exclus: ['Eric COJON'] });
assert.equal(e4.designation, 'Madame Fatima BENALI');
assert.equal(e4.profil, 'F');
assert.equal(e4.fonction, 'depute');
assert.ok(e4.elueFem);
const e5 = L.extraire(`Objet : demande de logement de M. Karim AZZOUZ
Monsieur le Directeur,
J'attire votre attention sur la demande de M. AZZOUZ qui recherche un appartement de type III sur Tourcoing à proximité des écoles.`);
assert.equal(e5.designation, 'Monsieur Karim AZZOUZ');
assert.equal(e5.typologie, '3');
assert.equal(e5.lieu, 'Tourcoing');
assert.ok(e5.criteres.includes('ecole'));
const e6 = L.extraire("Madame Christine MARTIN, Adjointe au Maire de Lille, à Monsieur Eric COJON. Je vous signale la situation de Monsieur et Madame Nguyen qui souhaitent un logement de type 2 ou 3 à Lomme.");
assert.equal(e6.designation, 'Monsieur et Madame Nguyen');
assert.equal(e6.fonction, 'adjoint');
const e7 = L.extraire("Monsieur Eric COJON, je vous transmets la demande de Monsieur Paul LEFEBVRE pour un T2 à Lille.", { exclus: ['Eric COJON'] });
assert.equal(e7.designation, 'Monsieur Paul LEFEBVRE');

// Courriers en majuscules, abréviations, casse des communes
const cas = (t, o) => L.extraire(t, o);
let x = cas("MONSIEUR ET MADAME DUPONT sollicitent un logement de Type 4 à LILLE.");
assert.equal(x.designation, 'Monsieur et Madame DUPONT'); assert.equal(x.profil, 'MF');
assert.equal(x.typologie, '4'); assert.equal(x.lieu, 'Lille');
x = cas("Mr Paul MARTIN souhaite un appartement TYPE 2 sur VILLENEUVE D'ASCQ. Le Maire. Copie : Madame la Présidente du Département");
assert.equal(x.designation, 'Monsieur Paul MARTIN'); assert.equal(x.typologie, '2');
assert.equal(x.lieu, "Villeneuve d'Ascq"); assert.equal(x.fonction, 'maire'); assert.ok(!x.elueFem);
x = cas("MONSIEUR LE DIRECTEUR GÉNÉRAL. Je vous signale Madame Sarah COHEN qui souhaite un T2 à Lille.");
assert.equal(x.designation, 'Madame Sarah COHEN');
x = cas("MADAME LA MAIRE DE LOOS. Monsieur Jean VIDAL, T3 à Loos");
assert.equal(x.designation, 'Monsieur Jean VIDAL'); assert.equal(x.fonction, 'maire'); assert.ok(x.elueFem);
x = cas("Le Maire de Lille. la situation de Madame Julie MAIRESSE qui souhaite un F3 à Lomme, conseillère en insertion.");
assert.equal(x.designation, 'Madame Julie MAIRESSE'); assert.ok(!x.elueFem);
assert.equal(L.dateLongue(new Date(2026, 9, 1)), '1er Octobre 2026');
// Courrier écrit par le demandeur lui-même (numéro tout en chiffres, négations)
x = cas(`Monsieur NASSERI Faridoum 16 rue d'Aquitaine 59760 Grande-Synthe Numéro unique de demande : 059102384157559900
Madame, Monsieur, Je me permets de vous adresser ce courrier afin d'attirer votre attention sur ma demande de logement.
Je réside actuellement à Grande-Synthe, dans un appartement sans ascenseur ni balcon. Je suis père de huit enfants.
Je suis actuellement en activité professionnelle à la mairie de Grande-Synthe. Je souhaiterais une maison avec un extérieur
afin que mes enfants puissent grandir. Je souhaiterais que ce logement puisse être situé à Lille ou dans ses environs.`);
assert.equal(x.designation, 'Monsieur NASSERI Faridoum');
assert.equal(x.numero, '059102384157559900');
assert.equal(x.fonction, 'demandeur');
assert.equal(x.lieu, 'Lille ou dans ses environs');
assert.ok(!x.criteres.includes('asc'));
assert.ok(x.criteres.includes('maison') && x.criteres.includes('ext'));
const dir = L.generer({ ...x, typologie: '5', criteresTextes: [], agence: { nom: 'Lille' } });
assert.ok(dir.includes('\nMonsieur,\n'));
assert.ok(dir.includes('vous avez exprimé le souhait d\'obtenir un logement de type 5 à Lille ou dans ses environs.'));
assert.ok(dir.includes('vous serez directement contacté par'));
assert.ok(dir.includes('Je vous prie d\'agréer, Monsieur, l\'expression de mes salutations distinguées.'));
assert.ok(L.generer({ ...x, profil: 'MF', agence: {} }).includes('\nMadame, Monsieur,\n'));
// Courriers du Maire de Lille (Q_12198, Q_12192) : secteur, environs, « métropole » n'est pas « métro »
x = cas(`Mon attention a été attirée sur la demande de logement de Madame Elisa Humetz, domiciliée 22/6 place du Marché aux Chevaux
à Fruges (62310). l'intéressée a récemment déposé un dossier, enregistré sous le numéro départemental unique
0590826031788GDPUB, en vue de l'attribution d'un T3 ou T4 dans la région et de préférence au sein de la métropole lilloise.
ne disposant pas du permis de conduire, elle privilégie les communes bien desservies par les transports en commun. LE MAIRE`);
assert.equal(x.designation, 'Madame Elisa Humetz'); assert.equal(x.profil, 'F');
assert.equal(x.numero, '0590826031788GDPUB'); assert.equal(x.typologie, '3 ou 4');
assert.equal(x.lieu, 'au sein de la métropole lilloise'); assert.equal(x.fonction, 'maire');
// « transports en commun » est dans un autre paragraphe que la demande : non repris (cf. réponse type)
assert.deepEqual(x.criteres, []);
// Réponse type fournie par le service pour ce courrier
assert.ok(L.generer({ ...x, designation: 'Madame Élisa Humetz', criteresTextes: [],
  agence: { nom: 'Lille', adresse: '2 bis rue Georges Courteline à Lille', horaires: 'du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00' } }).includes(
`Monsieur le Maire,

J'ai bien pris connaissance de votre courrier par lequel vous avez appelé mon attention sur la situation de Madame Élisa Humetz dans le cadre de sa demande de logement.

Après examen de sa requête, je vous confirme que Madame Élisa Humetz a exprimé le souhait d'obtenir un logement de type 3 ou 4 au sein de la métropole lilloise.

Conformément aux procédures en vigueur, son dossier sera présenté à la Commission d'Attribution des Logements et d'Examen de l'Occupation des Logements ( CALEOL ) de l'agence de Lille dès qu'un logement correspondant à ses critères de recherche sera disponible.

Le cas échéant, Madame Élisa Humetz sera directement contactée par l'un de nos conseillers commerciaux afin de convenir d'un rendez-vous.

Madame Élisa Humetz a également la possibilité de se rapprocher de l'accueil de l'agence de Lille, situé au 2 bis rue Georges Courteline à Lille, ouverte du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00, pour tout renseignement relatif au suivi de sa demande.

Je vous prie d'agréer, Monsieur le Maire, l'expression de ma considération distinguée.`));
x = cas(`HOTEL DE VILLE. Mon attention a été attirée sur la demande de logement de Monsieur Hamid Boutarit, hébergé depuis plusieurs années.
Il a déposé un dossier, enregistré sous le numéro départemental unique 0590823827278GDPUB, en vue de l'attribution d'un appartement
de type 2 à Lille ou ses environs, et dans un immeuble pourvu d'un ascenseur s'il est situé à l'étage. Monsieur Boutarit aspire à stabiliser sa situation.`);
assert.equal(x.designation, 'Monsieur Hamid Boutarit'); assert.equal(x.typologie, '2');
assert.equal(x.lieu, 'Lille ou ses environs'); assert.deepEqual(x.criteres, ['asc']);
// Réponse type fournie par le service pour ce courrier (critère du logement placé avant la commune)
assert.ok(L.generer({ ...x, reference: '12192', date: '25 Septembre 2026', suiviPar: "Romy DOISNE - Commerciale d'agence",
  criteresLogement: ['avec ascenseur'], criteresTextes: [],
  agence: { nom: 'Lille', adresse: '2 bis rue Georges Courteline à Lille', horaires: 'du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00' } }) ===
`Lille, le 25 Septembre 2026


Nos réf. : 12192
Affaire suivie par : Romy DOISNE - Commerciale d'agence

Objet : Demande de logement pour Monsieur Hamid Boutarit - 0590823827278GDPUB


Monsieur le Maire,

J'ai bien pris connaissance de votre courrier par lequel vous avez appelé mon attention sur la situation de Monsieur Hamid Boutarit dans le cadre de sa demande de logement.

Après examen de sa requête, je vous confirme que Monsieur Hamid Boutarit a exprimé le souhait d'obtenir un logement de type 2 avec ascenseur à Lille ou ses environs.

Conformément aux procédures en vigueur, son dossier sera présenté à la Commission d'Attribution des Logements et d'Examen de l'Occupation des Logements ( CALEOL ) de l'agence de Lille dès qu'un logement correspondant à ses critères de recherche sera disponible.

Le cas échéant, Monsieur Hamid Boutarit sera directement contacté par l'un de nos conseillers commerciaux afin de convenir d'un rendez-vous.

Monsieur Hamid Boutarit a également la possibilité de se rapprocher de l'accueil de l'agence de Lille, situé au 2 bis rue Georges Courteline à Lille, ouverte du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00, pour tout renseignement relatif au suivi de sa demande.

Je vous prie d'agréer, Monsieur le Maire, l'expression de ma considération distinguée.


Eric COJON
Directeur Général
#signature#`);
const sh = (log) => L.generer({ typologie: '3', lieu: 'Lille', criteresLogement: log, agence: {} }).split('\n').find(l => /souhait/.test(l));
assert.ok(sh(['en maison individuelle', 'avec un extérieur']).includes('type 3 en maison individuelle avec un extérieur à Lille.'));
assert.ok(sh(['en rez-de-chaussée', 'avec ascenseur']).includes('type 3 en rez-de-chaussée avec ascenseur à Lille.'));
console.log('OK');
