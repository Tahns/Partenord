/* Extraction des informations d'un courrier de demande de logement
   et génération de la réponse. Aucune donnée ne quitte le navigateur. */
(function (root) {
  'use strict';

  // ---------- Profils des demandeurs (accords) ----------
  // pl : pluriel, fem : tout au féminin
  var PROFILS = {
    M:  { label: 'Monsieur',            civ: 'Monsieur',            pl: false, fem: false },
    F:  { label: 'Madame',              civ: 'Madame',              pl: false, fem: true  },
    MF: { label: 'Monsieur et Madame',  civ: 'Monsieur et Madame',  pl: true,  fem: false },
    MM: { label: 'Messieurs',           civ: 'Messieurs',           pl: true,  fem: false },
    FF: { label: 'Mesdames',            civ: 'Mesdames',            pl: true,  fem: true  }
  };

  // ---------- Fonctions de l'élu / correspondant ----------
  var FONCTIONS = {
    maire:      { label: 'Maire',                    m: 'Monsieur le Maire',                    f: 'Madame la Maire' },
    adjoint:    { label: 'Adjoint(e) au Maire',      m: "Monsieur l'Adjoint au Maire",          f: "Madame l'Adjointe au Maire" },
    depute:     { label: 'Député(e)',                m: 'Monsieur le Député',                   f: 'Madame la Députée' },
    senateur:   { label: 'Sénateur / Sénatrice',     m: 'Monsieur le Sénateur',                 f: 'Madame la Sénatrice' },
    prefet:     { label: 'Préfet(e)',                m: 'Monsieur le Préfet',                   f: 'Madame la Préfète' },
    ministre:   { label: 'Ministre',                 m: 'Monsieur le Ministre',                 f: 'Madame la Ministre' },
    president:  { label: 'Président(e)',             m: 'Monsieur le Président',                f: 'Madame la Présidente' },
    conseiller: { label: 'Conseiller(ère) départemental(e)', m: 'Monsieur le Conseiller départemental', f: 'Madame la Conseillère départementale' },
    autre:      { label: 'Autre (Madame, Monsieur)', m: 'Madame, Monsieur',                     f: 'Madame, Monsieur' },
    // Courrier écrit par le demandeur lui-même : réponse qui lui est adressée directement
    demandeur:  { label: 'Le demandeur lui-même (réponse directe)', m: '', f: '' }
  };

  // ---------- Critères de recherche fréquents ----------
  var CRITERES = [
    { id: 'metro',   texte: "près d'une station de métro",            re: /\bm[ée]tro\b/i },
    { id: 'tram',    texte: "près d'une station de tramway",          re: /tram/i },
    { id: 'bus',     texte: 'bien desservi par les transports en commun', re: /\bbus\b|transports? en commun/i },
    { id: 'rdc',     texte: 'en rez-de-chaussée',                     re: /rez[\s-]de[\s-]chauss/i },
    { id: 'asc',     texte: 'desservi par un ascenseur',              re: /ascenseur/i },
    { id: 'pmr',     texte: 'adapté à une personne à mobilité réduite', re: /mobilit[ée] r[ée]duite|\bPMR\b|fauteuil roulant|handicap/i },
    { id: 'ecole',   texte: 'à proximité des écoles',                 re: /[ée]coles?\b|scolaris/i },
    { id: 'jardin',  texte: 'avec jardin',                            re: /jardin/i },
    { id: 'maison',  texte: 'en maison individuelle',                 re: /\bmaisons?\b(?! de (?:quartier|retraite|sant[ée]|la))/i },
    { id: 'ext',     texte: 'avec un extérieur',                      re: /\bext[ée]rieur\b|balcon|terrasse/i }
  ];

  var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
              'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  function dateLongue(d) {
    return (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ---------- Nettoyage du texte OCR ----------
  function normaliser(texte) {
    return String(texte || '')
      .replace(/\r/g, '')
      .replace(/['`]/g, "'")
      .replace(/([a-zà-ÿ])-\n([a-zà-ÿ])/g, '$1$2') // césures en fin de ligne
      .replace(/[ \t ]+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var MAJ = 'A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ';
  var LET = "A-Za-zÀ-ÖØ-öø-ÿ'";
  var CIV = '(Monsieur|Madame|Mademoiselle|Messieurs|Mesdames|MONSIEUR|MADAME|MADEMOISELLE|MESSIEURS|MESDAMES|MM\\.?|Mmes\\.?|Mme\\.?|Mlle\\.?|Mr\\.?|M\\.)';
  var ET = '\\s(?:et|ET)\\s';
  // Nom : 1 à 3 mots commençant par une majuscule (particules autorisées)
  var NOM = "((?:(?:de|du|des|van|von|le|la|el|ben|d')\\s?)?[" + MAJ + "][" + LET + "-]+(?:\\s(?:(?:de|du|des|van|von|el|ben|d')\\s?)?[" + MAJ + "][" + LET + "-]+){0,2})";
  // Mots qui ne peuvent pas faire partie d'un nom de demandeur ni d'une commune (majuscules ou non)
  var MOTS_EXCLUS = /^(?:le|la|les|l'|je|nous|vous|il|elle|ils|elles|en|par|pour|mon|ma|mes|ce|cette|au|aux|et|de|du|des|objet|habitat|monsieur|madame|mademoiselle|messieurs|mesdames|directeur|directrice|g[ée]n[ée]rale?|maire|mairie|pr[ée]sidente?|pr[ée]f[eè]te?|pr[ée]fecture|d[ée]put[ée]e?|s[ée]nat(?:eur|rice)?|conseill[eè]re?|adjointe?|ministre|d[ée]l[ée]gu[ée]e?|partenord)$/i;
  // Titre qui suit le nom d'un élu ou d'un destinataire : ce n'est pas le demandeur
  var FONCTION_APRES = /^,?\s(?:(?:le|la|l')\s?)?(?:Directeur|Directrice|Maire|Pr[ée]sident|Pr[ée]f[eè]t|D[ée]put[ée]|S[ée]nat|Conseill|Adjoint|Ministre|D[ée]l[ée]gu[ée])/i;

  function civNorm(c) {
    c = c.replace(/\.$/, '');
    if (/^[A-Z]{4,}$/.test(c)) c = c.charAt(0) + c.slice(1).toLowerCase();
    if (/^(M|Mr|Monsieur)$/.test(c)) return 'Monsieur';
    if (/^(Mme|Madame|Mlle|Mademoiselle)$/.test(c)) return 'Madame';
    if (/^(MM|Messieurs)$/.test(c)) return 'Messieurs';
    if (/^(Mmes|Mesdames)$/.test(c)) return 'Mesdames';
    return c;
  }

  function nomValide(nom) {
    var premier = nom.split(/\s/)[0];
    return !MOTS_EXCLUS.test(premier) && nom.length > 1;
  }

  // Retire les mots en trop capturés après le nom (ex. "Dupont Lille")
  function nettoyerNom(nom) {
    var mots = nom.split(' ');
    var out = [];
    for (var i = 0; i < mots.length; i++) {
      if (i > 0 && MOTS_EXCLUS.test(mots[i])) break;
      out.push(mots[i]);
    }
    return out.join(' ');
  }

  function profilDepuisCivs(civs) {
    var h = civs.filter(function (c) { return c === 'Monsieur'; }).length;
    var f = civs.filter(function (c) { return c === 'Madame'; }).length;
    if (civs.indexOf('Messieurs') >= 0) return 'MM';
    if (civs.indexOf('Mesdames') >= 0) return 'FF';
    if (h && f) return 'MF';
    if (h > 1) return 'MM';
    if (f > 1) return 'FF';
    return f ? 'F' : 'M';
  }

  // ---------- Demandeur(s) ----------
  function extraireDemandeurs(t, exclus) {
    var candidats = [];
    var re, m;
    // On compare sur le nom de famille (dernier mot) des personnes à exclure
    exclus = (exclus || []).map(function (n) { return n.trim().split(/\s+/).pop().toLowerCase(); })
      .filter(function (n) { return n.length > 2; });
    // Nom de l'élu, du destinataire (« à Monsieur … ») ou du signataire de la réponse
    function horsSujet(debut, fin, noms) {
      if (FONCTION_APRES.test(t.slice(fin, fin + 40))) return true;
      if (/(?:^|\s)(?:à|A)\s$/.test(t.slice(Math.max(0, debut - 3), debut))) return true;
      return noms.some(function (n) {
        return n.toLowerCase().split(' ').some(function (w) { return exclus.indexOf(w) >= 0; });
      });
    }

    // "Monsieur Jean DUPONT et Madame Marie MARTIN" (noms différents)
    re = new RegExp(CIV + '\\s' + NOM + ET + CIV + '\\s' + NOM, 'g');
    while ((m = re.exec(t))) {
      var n1 = nettoyerNom(m[2]), n2 = nettoyerNom(m[4]);
      if (!nomValide(n1) || !nomValide(n2) || horsSujet(m.index, m.index + m[0].length, [n1, n2])) continue;
      var c1 = civNorm(m[1]), c2 = civNorm(m[3]);
      var designation = n1 === n2 ? c1 + ' et ' + c2 + ' ' + n1 : c1 + ' ' + n1 + ' et ' + c2 + ' ' + n2;
      candidats.push({ designation: designation, nom: n1 === n2 ? n1 : '', profil: profilDepuisCivs([c1, c2]), personnes: 2, pos: m.index });
    }

    // "Monsieur et Madame DUPONT"
    re = new RegExp(CIV + ET + CIV + '\\s' + NOM, 'g');
    while ((m = re.exec(t))) {
      var nom = nettoyerNom(m[3]);
      if (!nomValide(nom) || horsSujet(m.index, m.index + m[0].length, [nom])) continue;
      var a = civNorm(m[1]), b = civNorm(m[2]);
      candidats.push({ designation: a + ' et ' + b + ' ' + nom, nom: nom, profil: profilDepuisCivs([a, b]), personnes: 2, pos: m.index });
    }

    // "Madame DUPONT", "Messieurs DUPONT"
    re = new RegExp(CIV + '\\s' + NOM, 'g');
    while ((m = re.exec(t))) {
      var nm = nettoyerNom(m[2]);
      if (!nomValide(nm) || horsSujet(m.index, m.index + m[1].length + 1 + nm.length, [nm])) continue;
      var c = civNorm(m[1]);
      var p = profilDepuisCivs([c]);
      candidats.push({ designation: c + ' ' + nm, nom: nm, profil: p, personnes: PROFILS[p].pl ? 2 : 1, pos: m.index });
    }

    if (!candidats.length) return null;

    // Le demandeur principal : la désignation la plus complète, puis la plus citée, puis la première.
    var compte = {};
    candidats.forEach(function (c) { compte[c.designation] = (compte[c.designation] || 0) + 1; });
    candidats.sort(function (x, y) {
      return (y.personnes - x.personnes) || (compte[y.designation] - compte[x.designation]) || (x.pos - y.pos);
    });
    return candidats[0];
  }

  // ---------- Numéro unique départemental ----------
  function extraireNumero(t) {
    // Supprime les espaces parasites de l'OCR à l'intérieur des nombres
    var s = t.replace(/(\d)[ .](?=\d)/g, '$1');
    // Deux formes : chiffres + lettres (0590423808575GDPUB) ou uniquement des chiffres (059102384157559900)
    var re = /\b(?:(0[0-9OSIlB]{11,14})\s?([A-Z]{3,6})|(0\d{15,19}))\b/g, m, best = null;
    while ((m = re.exec(s))) {
      var num = m[3] || m[1].replace(/O/g, '0').replace(/S/g, '5').replace(/[Il]/g, '1').replace(/B/g, '8') + m[2];
      var contexte = s.slice(Math.max(0, m.index - 80), m.index);
      var score = /num[ée]ro|unique|NUR|enregistr|dossier/i.test(contexte) ? 2 : 1;
      if (!best || score > best.score) best = { num: num, score: score };
    }
    return best ? best.num : '';
  }

  // ---------- Typologie ----------
  var ROMAINS = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7' };
  function chiffreType(x) { return ROMAINS[x] || x; }

  function extraireTypologie(t) {
    var re = /\b(?:de\s)?(?:[Tt]ype|TYPE|[Tt]ypologie|TYPOLOGIE|T|F)\s?(\d|I{1,3}|IV|VI{0,2}|V)\b(?:\s?(?:ou|OU|\/|à|-|et)\s?(?:(?:de\s)?(?:[Tt]ype|TYPE|T|F)\s?)?(\d)\b)?/g;
    var m;
    while ((m = re.exec(t))) {
      // ignore "T 03 20 ..." (téléphone) et références type "F2023"
      if (/^\s?\d{2}/.test(t.slice(m.index + m[0].length))) continue;
      var a = chiffreType(m[1]);
      if (+a < 1 || +a > 7) continue;
      return { valeur: m[2] ? a + ' ou ' + m[2] : a, index: m.index + m[0].length };
    }
    if (/\bstudio\b/i.test(t)) return { valeur: '1', index: t.search(/\bstudio\b/i) + 6 };
    return null;
  }

  // ---------- Lieu souhaité ----------
  var VILLE = "([" + MAJ + "][" + LET + "]*(?:-[" + LET + "]+)*(?:\\s(?:d'|D'|de\\s|DE\\s|du\\s|DU\\s|en\\s|EN\\s|sur\\s|SUR\\s|lez\\s|LEZ\\s|lès\\s|LÈS\\s)[" + MAJ + "][" + LET + "]*(?:-[" + LET + "]+)*)?)";

  // « VILLENEUVE D'ASCQ » -> « Villeneuve d'Ascq »
  function casseVille(v) {
    if (v !== v.toUpperCase()) return v;
    return v.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, function (x, a, b) { return a + b.toUpperCase(); })
      .replace(/\b(D'|De |Du |En |Sur |Lez |Lès )/g, function (x) { return x.toLowerCase(); })
      .replace(/(d')([a-zà-ÿ])/g, function (x, a, b) { return a + b.toUpperCase(); });
  }

  function extraireLieu(t, apres) {
    return lieuBrut(t, apres);
  }

  // « au sein de la métropole lilloise », « dans l'agglomération lensoise »
  var SECTEUR = /((?:au sein de|dans|sur)\s(?:la|l')\s?(?:m[ée]tropole|agglom[ée]ration|communaut[ée] urbaine)(?:\s(?:lilloise|de Lille|[a-zà-ÿ]+oise|du [A-ZÀ-Ÿ][\wÀ-ÿ'-]+|de [A-ZÀ-Ÿ][\wÀ-ÿ'-]+))?)/i;
  // « à Lille ou ses environs » est repris tel quel
  var ENVIRONS = "((?:\\s(?:ou|et)\\s(?:dans\\s)?(?:ses|leurs)\\s(?:environs|alentours))?)";

  function lieuBrut(t, apres) {
    if (apres != null) {
      var zone = t.slice(apres, apres + 110);
      var m = new RegExp("(?:^|\\s)(?:sur la commune de|dans le secteur de|secteur de|sur|à)\\s" + VILLE + ENVIRONS).exec(zone);
      if (m && !MOTS_EXCLUS.test(m[1])) return casseVille(m[1]) + m[2];
      var sec = SECTEUR.exec(zone);
      if (sec) return sec[1];
    }
    var m2 = new RegExp("(?:logement|appartement|maison)[^.]{0,60}?\\s(?:sur la commune de|secteur de|à)\\s" + VILLE + ENVIRONS).exec(t);
    if (m2 && !MOTS_EXCLUS.test(m2[1])) return casseVille(m2[1]) + m2[2];
    // L'adresse actuelle du demandeur n'est pas reprise : mieux vaut un champ vide qu'une commune fausse
    return '';
  }

  // ---------- Correspondant (élu) ----------
  function extraireFonction(t) {
    // [fonction, détection, forme féminine]
    var tests = [
      ['depute',     /d[ée]put[ée]|assembl[ée]e nationale/i, /d[ée]put[ée]e\b/i],
      ['senateur',   /s[ée]nat(eur|rice)?\b/i,              /s[ée]natrice/i],
      ['prefet',     /pr[ée]f[èe]t|pr[ée]fecture/i,          /pr[ée]f[èe]te\b/i],
      ['ministre',   /\bministre\b/i,                       /\b(?:madame )?la ministre\b/i],
      ['adjoint',    /adjointe? au maire/i,                  /adjointe au maire/i],
      ['conseiller', /conseill[eè]re? d[ée]partementa/i,     /conseill[èe]re d[ée]partementale/i],
      ['president',  /\bpr[ée]sidente?\b/i,                  /\bpr[ée]sidente\b/i],
      ['maire',      /\bmaire\b|h[ôo]tel de ville|mairie/i, /\b(?:madame )?la maire\b/i]
    ];
    // La fonction citée en premier (en-tête du courrier) l'emporte
    var best = null;
    tests.forEach(function (x) {
      var m = x[1].exec(t);
      if (m && (!best || m.index < best.index)) best = { fonction: x[0], index: m.index, fem: x[2] };
    });
    if (!best) return { fonction: 'autre', fem: false };
    var fem = best.fem.test(t);
    return { fonction: best.fonction, fem: fem };
  }

  // Critère cité autrement que sous une négation (« sans ascenseur ni balcon » décrit le logement actuel)
  function critereDemande(t, re) {
    var g = new RegExp(re.source, 'gi'), m;
    while ((m = g.exec(t))) {
      if (!/\b(?:sans|ni|pas d'|pas de|aucun|aucune)\s(?:\S+\s){0,2}$/i.test(t.slice(Math.max(0, m.index - 30), m.index))) return true;
    }
    return false;
  }

  // Phrase qui formule la demande (celle du type de logement) : seuls ses critères sont repris,
  // les autres éléments du courrier (situation, préférences secondaires) restent à l'appréciation de l'agent
  function phraseDemande(t, typo) {
    if (!typo) return t;
    var debut = t.lastIndexOf('. ', typo.index) + 1;
    var fin = t.slice(typo.index).search(/\.(?:\s+[^\d\s]|\s*$)/);
    return t.slice(debut, fin < 0 ? t.length : typo.index + fin);
  }

  // Courrier écrit par le demandeur (« ma demande », « je réside »…) plutôt que par un élu
  function ecritParDemandeur(t) {
    var signes = t.match(/\b(?:ma demande|mon dossier|ma situation|ma famille|mes enfants|mon logement|je r[ée]side|mon foyer|ma candidature|mon épouse|mon mari|ma conjointe|mon conjoint)\b/gi) || [];
    var tiers = /(?:attention|situation|demande) (?:de|sur la situation de|sur la demande de) (?:M\.|Mme|Monsieur|Madame|Mademoiselle)\b/i.test(t);
    return signes.length >= 2 && !tiers;
  }

  // options.exclus : noms à ne jamais retenir comme demandeur (ex. signataire de la réponse)
  function extraire(texteBrut, options) {
    var t = normaliser(texteBrut);
    var dem = extraireDemandeurs(t, (options || {}).exclus);
    var typo = extraireTypologie(t);
    var lieu = extraireLieu(t, typo ? typo.index : null);
    var fct = ecritParDemandeur(t) ? { fonction: 'demandeur', fem: false } : extraireFonction(t);
    return {
      designation: dem ? dem.designation : '',
      profil: dem ? dem.profil : 'MF',
      numero: extraireNumero(t),
      typologie: typo ? typo.valeur : '',
      lieu: lieu,
      fonction: fct.fonction,
      elueFem: fct.fem,
      mutation: /\bmutation\b/i.test(t),
      criteres: CRITERES.filter(function (c) { return critereDemande(phraseDemande(t, typo), c.re); }).map(function (c) { return c.id; }),
      texte: t
    };
  }

  // ---------- Génération de la réponse ----------
  function joindre(liste) {
    if (liste.length <= 1) return liste.join('');
    return liste.slice(0, -1).join(', ') + ' et ' + liste[liste.length - 1];
  }

  function generer(d) {
    var p = PROFILS[d.profil] || PROFILS.MF;
    var D = (d.designation || '').trim() || '[DEMANDEUR]';
    var acc = p.pl ? (p.fem ? 'es' : 's') : (p.fem ? 'e' : '');
    var pos = p.pl ? 'leur' : 'sa';          // sa / leur demande
    var posM = p.pl ? 'leur' : 'son';        // son / leur dossier
    var posPl = p.pl ? 'leurs' : 'ses';      // ses / leurs critères
    var avoir = p.pl ? 'ont' : 'a';
    var etre = p.pl ? 'seront' : 'sera';
    var f = FONCTIONS[d.fonction] || FONCTIONS.maire;
    var titre = d.elueFem ? f.f : f.m;
    var nature = d.mutation ? 'mutation' : 'logement';
    var typo = (d.typologie || '').trim() || '[TYPE]';
    var lieu = (d.lieu || '').trim();
    var crit = (d.criteresTextes || []).filter(Boolean);
    var agence = d.agence || {};
    var nomAgence = agence.nom || '[AGENCE]';

    if (d.fonction === 'demandeur') return genererDirect(d, p, D, nature, typo, lieu, crit, agence, nomAgence, acc);

    var souhait = 'le souhait d\'obtenir un logement de type ' + typo +
      (lieu ? ' ' + (/^[\u0001]?(à|a|sur|dans|en|au|aux)\s/i.test(lieu) ? lieu : 'à ' + lieu) : '') +
      (crit.length ? ' ' + joindre(crit) : '') + '.';

    var lignes = [];
    lignes.push((d.ville || 'Lille') + ', le ' + (d.date || dateLongue(new Date())));
    lignes.push('', '');
    lignes.push('Nos réf. : ' + (d.reference || ''));
    lignes.push('Affaire suivie par : ' + (d.suiviPar || ''));
    lignes.push('');
    lignes.push('Objet : Demande de ' + nature + ' pour ' + D + (d.numero ? ' - ' + d.numero : ''));
    lignes.push('', '');
    lignes.push(titre + ',');
    lignes.push('');
    lignes.push('J\'ai bien pris connaissance de votre courrier par lequel vous avez appelé mon attention sur la situation de ' + D +
      ' dans le cadre de ' + pos + ' demande de ' + nature + '.');
    lignes.push('');
    lignes.push('Après examen de ' + pos + ' requête, je vous confirme que ' + D + ' ' + avoir + ' exprimé ' + souhait);
    lignes.push('');
    lignes.push('Conformément aux procédures en vigueur, ' + posM + ' dossier sera présenté à la Commission d\'Attribution des Logements et d\'Examen de l\'Occupation des Logements ( CALEOL ) de l\'agence de ' + nomAgence +
      ' dès qu\'un logement correspondant à ' + posPl + ' critères de recherche sera disponible.');
    lignes.push('');
    lignes.push('Le cas échéant, ' + D + ' ' + etre + ' directement contacté' + acc + ' par l\'un de nos conseillers commerciaux afin de convenir d\'un rendez-vous.');
    lignes.push('');
    lignes.push(D + ' ' + avoir + ' également la possibilité de se rapprocher de l\'accueil de l\'agence de ' + nomAgence +
      (agence.adresse ? ', situé au ' + agence.adresse : '') +
      (agence.horaires ? ', ouverte ' + agence.horaires : '') +
      ', pour tout renseignement relatif au suivi de ' + pos + ' demande.');
    lignes.push('');
    lignes.push('Je vous prie d\'agréer, ' + titre + ', l\'expression de ma considération distinguée.');
    lignes.push('', '');
    (d.signature || 'Eric COJON\nDirecteur Général\n#signature#').split('\n').forEach(function (l) { lignes.push(l); });

    return lignes.join('\n');
  }

  // Réponse adressée directement au demandeur (vouvoiement)
  var APPEL_DIRECT = { M: 'Monsieur', F: 'Madame', MF: 'Madame, Monsieur', MM: 'Messieurs', FF: 'Mesdames' };
  function formuleSouhait(typo, lieu, crit) {
    return 'le souhait d\'obtenir un logement de type ' + typo +
      (lieu ? ' ' + (/^[\u0001]?(à|a|sur|dans|en|au|aux)\s/i.test(lieu) ? lieu : 'à ' + lieu) : '') +
      (crit.length ? ' ' + joindre(crit) : '') + '.';
  }
  function genererDirect(d, p, D, nature, typo, lieu, crit, agence, nomAgence, acc) {
    var appel = APPEL_DIRECT[d.profil] || APPEL_DIRECT.MF;
    var lignes = [];
    lignes.push((d.ville || 'Lille') + ', le ' + (d.date || dateLongue(new Date())));
    lignes.push('', '');
    lignes.push('Nos réf. : ' + (d.reference || ''));
    lignes.push('Affaire suivie par : ' + (d.suiviPar || ''));
    lignes.push('');
    lignes.push('Objet : Demande de ' + nature + ' pour ' + D + (d.numero ? ' - ' + d.numero : ''));
    lignes.push('', '');
    lignes.push(appel + ',');
    lignes.push('');
    lignes.push('J\'ai bien pris connaissance de votre courrier relatif à votre demande de ' + nature + '.');
    lignes.push('');
    lignes.push('Après examen de votre requête, je vous confirme que vous avez exprimé ' + formuleSouhait(typo, lieu, crit));
    lignes.push('');
    lignes.push('Conformément aux procédures en vigueur, votre dossier sera présenté à la Commission d\'Attribution des Logements et d\'Examen de l\'Occupation des Logements ( CALEOL ) de l\'agence de ' + nomAgence +
      ' dès qu\'un logement correspondant à vos critères de recherche sera disponible.');
    lignes.push('');
    lignes.push('Le cas échéant, vous serez directement contacté' + acc + ' par l\'un de nos conseillers commerciaux afin de convenir d\'un rendez-vous.');
    lignes.push('');
    lignes.push('Vous avez également la possibilité de vous rapprocher de l\'accueil de l\'agence de ' + nomAgence +
      (agence.adresse ? ', situé au ' + agence.adresse : '') +
      (agence.horaires ? ', ouverte ' + agence.horaires : '') +
      ', pour tout renseignement relatif au suivi de votre demande.');
    lignes.push('');
    lignes.push('Je vous prie d\'agréer, ' + appel + ', l\'expression de mes salutations distinguées.');
    lignes.push('', '');
    (d.signature || 'Eric COJON\nDirecteur Général\n#signature#').split('\n').forEach(function (l) { lignes.push(l); });
    return lignes.join('\n');
  }

  var api = { PROFILS: PROFILS, FONCTIONS: FONCTIONS, CRITERES: CRITERES, extraire: extraire, generer: generer, normaliser: normaliser, dateLongue: dateLongue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Lettre = api;
})(this);
