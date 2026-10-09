/* Convocations du conciliateur de justice : extraction des informations
   et rédaction du pouvoir (texte + fichier Word). Aucune donnée ne quitte le navigateur. */
(function (root) {
  'use strict';

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  var DEFAUT = {
    signataire: 'Monsieur Marc ALESSIO',
    fonction: 'Directeur Territorial',
    domicile: '150 Bis rue Nationale 59000 LILLE',
    // Personnes qui peuvent représenter Partenord (choix dans la page)
    mandataires: [
      { nom: 'Monsieur Hicham KHALFI', adresse: '2 bis Georges Courteline, 59000 Lille' },
      { nom: 'Madame Cathy CLAIRON', adresse: '2 bis Georges Courteline, 59000 Lille' }
    ],
    ville: 'Lille',
    entete: 'Direction territoriale\nLille Métropole\n150 bis rue Nationale\n59000 LILLE\n09 69 39 59 59'
  };

  function dateCourte(d) {
    return (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ---------- Nettoyage de l'OCR : on garde les lignes, on retire les traits parasites en bord de page ----------
  function lignesPropres(texte) {
    return String(texte || '').replace(/\r/g, '').replace(/[’`]/g, "'").split('\n').map(function (l) {
      var avant;
      do {
        avant = l;
        l = l.replace(/\s+[|!{}\[\]ÏiIjJ‘'";:,.]\s*$/, '').replace(/^\s*[|!{}\[\]‘]\s+/, '');
      } while (l !== avant);
      return l.replace(/[ \t ]+/g, ' ').trim();
    }).filter(function (l) { return l && !/^[|!{}\[\]ÏiIjJ‘'".,;:\-–—_ ]+$/.test(l); });
  }

  // Assemble des lignes : virgule entre deux éléments d'adresse, espace au milieu d'une phrase
  function joindreLignes(lignes) {
    return lignes.reduce(function (acc, l) {
      if (!acc) return l;
      var coupe = /(?:\s|^)(?:de|du|des|la|le|les|l'|d'|à|au|aux|en|sur|et)$/i.test(acc) || /^[a-zà-ÿ]/.test(l);
      return acc + (coupe ? ' ' : ', ') + l;
    }, '');
  }

  var CIV = "(Madame|Monsieur|Mademoiselle|Mme\\.?|Mlle\\.?|Mr\\.?|M\\.?)";
  var MOT_NOM = "[A-ZÀ-Ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]+";

  function civilite(c) {
    c = c.replace(/\.$/, '');
    if (/^(M|Mr|Monsieur)$/.test(c)) return 'Monsieur';
    return 'Madame';
  }

  // « M Hicham KHALFI » -> « Monsieur Hicham KHALFI »
  function personne(txt) {
    var m = new RegExp('^' + CIV + '\\s+(' + MOT_NOM + '(?:\\s+' + MOT_NOM + '){0,3})').exec(txt.trim());
    if (!m) return '';
    // on s'arrête avant « née », « épouse », « Demeurant »…
    var nom = m[2].replace(/\s+(?:née?|épouse|veuve|Demeurant|Domicilié|adresse)\b.*$/i, '');
    return civilite(m[1]) + ' ' + nom;
  }

  // ---------- Demandeur : première personne citée après « saisi d'un litige / du différend » ----------
  function extraireDemandeur(lignes, conciliateur) {
    var debut = -1;
    lignes.forEach(function (l, i) {
      if (debut < 0 && /saisi(?:e)?\s+(?:d'un|du)\s+(?:litige|diff[ée]rend)|d'une part/i.test(l)) debut = i;
    });
    for (var i = Math.max(0, debut); i < lignes.length; i++) {
      var l = lignes[i].replace(/^(?:D'une part\s*:?\s*)/i, '');
      var p = personne(l);
      if (!p || /conciliat/i.test(lignes[i + 1] || '') || /conciliat/i.test(l)) continue;
      if (conciliateur && p.toLowerCase().indexOf(conciliateur.toLowerCase()) >= 0) continue;
      return p;
    }
    return '';
  }

  // Nom du conciliateur (pour ne jamais le prendre pour le demandeur)
  function extraireConciliateur(lignes) {
    for (var i = 0; i < lignes.length; i++) {
      var m = /conciliateur de justice\s*:?\s*(.*)$/i.exec(lignes[i]);
      if (!m) continue;
      var nom = new RegExp('(' + MOT_NOM + '\\s+' + MOT_NOM + ')').exec(m[1]) || new RegExp('^(' + MOT_NOM + '\\s+' + MOT_NOM + ')').exec(lignes[i + 1] || '');
      if (nom) return nom[1].split(/\s+/).pop();
    }
    return '';
  }

  // ---------- Date et heure de la réunion ----------
  var RE_DATE = new RegExp(
    '(?:(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+)?' +
    '(?:(\\d{1,2})(?:er)?\\s+(' + MOIS.join('|').replace('février', 'f[ée]vrier').replace('août', 'ao[uû]t').replace('décembre', 'd[ée]cembre') + ')\\s+(\\d{4})' +
    '|(\\d{1,2})\\s*/\\s*(\\d{1,2})\\s*/\\s*(\\d{4}))' +
    '\\s*,?\\s*(?:à|a)\\s*(\\d{1,2})\\s*[hH:]\\s*(\\d{2})?', 'gi');

  function numeroMois(nom) {
    var n = nom.toLowerCase().replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre');
    return MOIS.indexOf(n);
  }

  function extraireReunion(texte) {
    RE_DATE.lastIndex = 0;
    var m = RE_DATE.exec(texte);
    if (!m) return null;
    var d = m[2] ? new Date(+m[4], numeroMois(m[3]), +m[2]) : new Date(+m[7], +m[6] - 1, +m[5]);
    var heure = +m[8] + 'h' + (m[9] || '00');
    return {
      date: d, jour: JOURS[d.getDay()] + ' ' + dateCourte(d), heure: heure,
      debut: m.index, fin: m.index + m[0].length
    };
  }

  // ---------- Lieu de la réunion ----------
  function casseTitre(s) {
    if (s !== s.toUpperCase() || !/[A-Z]{3}/.test(s)) return s;
    // « TRIBUNAL JUDICIAIRE DE LILLE » -> « Tribunal judiciaire de Lille »
    return s.toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); })
      .replace(/(\s(?:de|du|d')\s?)([a-zà-ÿ])/g, function (x, a, b) { return a + b.toUpperCase(); });
  }

  function nettoyerLieu(l) {
    l = l.replace(/^[\s\-–—,|]+/, '').replace(/[\s,;|]+$/, '')
      .replace(/\s+,/g, ',').replace(/,\s*(?:FR|France)$/i, '')
      .replace(/\s+-\s+(?=[A-ZÀ-Ÿ][a-zà-ÿ])/g, ', ')
      .replace(/^(à la|au|à l')\s+Mairie\b/i, function (x, a) { return a.toLowerCase() + ' mairie'; });
    // suites de mots en capitales (« TRIBUNAL JUDICIAIRE DE LILLE ») remises en casse normale
    l = l.replace(/[A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ']{2,})+/g, casseTitre);
    // virgule avant le numéro de rue : « La Madeleine 160 rue … » -> « La Madeleine, 160 rue … »
    l = l.replace(/([^\d,])\s+(\d+\s?(?:bis|ter|[A-Z])?\s(?:rue|avenue|av\.|boulevard|bd|place|chemin|all[ée]e|quai|square|impasse)\b)/gi, '$1, $2');
    return l;
  }

  function extraireLieu(lignes, texte, reunion) {
    if (!reunion) return '';
    // 1) après la date : « … à 15H | au TRIBUNAL JUDICIAIRE … où je vous recevrai »
    var apres = texte.slice(reunion.fin).replace(/^[\s|,;]+/, '');
    var fin = apres.search(/o[uù] je vous recevrai|A cette r[ée]union|À cette r[ée]union|\.\s|;\s|\n\s*\n/i);
    var zone = (fin >= 0 ? apres.slice(0, fin) : apres.slice(0, 200)).replace(/^[\s\-–—]+/, '');
    if (/^(?:à|au|a)\s/i.test(zone)) return nettoyerLieu(joindreLignes(zone.split('\n').map(function (l) { return l.replace(/^[\s\-–—]+/, '').trim(); }).filter(Boolean)));
    // 2) avant la date : « … qui aura lieu à la Mairie de La Madeleine 160 rue … le mercredi … »
    var avant = texte.slice(Math.max(0, reunion.debut - 250), reunion.debut);
    var m = /(?:aura lieu|se tiendra|prévue|organisée)\s+((?:à|au)\s[\s\S]+?)\s*(?:,?\s*le)?\s*$/i.exec(avant);
    if (m) return nettoyerLieu(joindreLignes(m[1].split('\n').map(function (l) { return l.trim(); }).filter(Boolean)));
    return '';
  }

  // ---------- Mandataire : « PARTENORD (M Hicham KHALFI) » ----------
  function extraireMandataire(texte) {
    var m = /PARTENORD[^()\n]{0,20}\(\s*([^)]+)\)/i.exec(texte);
    if (m) { var p = personne(m[1]); if (p) return p; }
    return '';
  }

  // Mandataire cité dans la convocation, rapproché de la liste connue par le nom de famille
  function mandataireConnu(nom, liste) {
    if (!nom) return -1;
    var famille = nom.split(/\s+/).pop().toLowerCase();
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].nom.toLowerCase().split(/\s+/).indexOf(famille) >= 0) return i;
    }
    return -1;
  }

  function extraire(texteBrut) {
    var lignes = lignesPropres(texteBrut);
    var texte = lignes.join('\n');
    var conciliateur = extraireConciliateur(lignes);
    var reunion = extraireReunion(texte);
    return {
      demandeur: extraireDemandeur(lignes, conciliateur),
      conciliateur: conciliateur,
      jour: reunion ? reunion.jour : '',
      heure: reunion ? reunion.heure : '',
      lieu: extraireLieu(lignes, texte, reunion),
      mandataire: extraireMandataire(texte),
      texte: texte
    };
  }

  // ---------- Texte du pouvoir ----------
  // Renvoie une liste de paragraphes { texte, style } ; style : titre, corps, date, signature, entete
  function pouvoir(d) {
    var r = Object.assign({}, DEFAUT, d.reglages || {});
    var mand = r.mandataires[d.mandataire] || r.mandataires[0] || { nom: '', adresse: '' };
    var trou = function (v, nom) { v = (v || '').trim(); return v || '[' + nom + ']'; };
    var lieu = (d.lieu || '').trim();
    // (le lieu peut être encadré par les marqueurs de surlignage de l'aperçu)
    if (lieu && !/^\u0001?(?:à|au|aux|en|dans)\s/i.test(lieu)) lieu = 'à ' + lieu;
    var corps = 'Je soussigné ' + r.signataire + ', ' + r.fonction + ' de PARTENORD HABITAT, domicilié ' + r.domicile +
      ', donne par la présente pouvoir à ' + trou(mand.nom, 'MANDATAIRE') + ', demeurant à ' + trou(mand.adresse, 'ADRESSE') +
      ', pour me représenter lors de la réunion de conciliation prévue le ' + trou(d.jour, 'DATE') + ' à ' + trou(d.heure, 'HEURE') +
      ' – ' + (lieu || '[LIEU]') + ', dans le cadre du différend opposant ' + trou(d.demandeur, 'DEMANDEUR') + ' à PARTENORD HABITAT.';
    var nomSignataire = r.signataire.replace(/^(?:Monsieur|Madame)\s+/, '');
    return [
      { style: 'entete', texte: r.entete },
      { style: 'titre', texte: 'POUVOIR' },
      { style: 'corps', texte: corps },
      { style: 'corps', texte: 'Le mandataire est autorisé à prendre toutes les décisions nécessaires en mon nom, y compris la signature de tout accord amiable concernant cette procédure de conciliation, sans avoir à me consulter au préalable.' },
      { style: 'corps', texte: 'Fait pour valoir ce que de droit.' },
      { style: 'corps', texte: r.ville + ' le ' + (d.datePouvoir || dateCourte(new Date())) + '.' },
      { style: 'signature', texte: r.fonction + '\n' + nomSignataire + '\n#signature#' }
    ];
  }

  function pouvoirTexte(d) {
    return pouvoir(d).map(function (p) { return p.texte; }).join('\n\n');
  }

  // ---------- Fichier Word (.docx) écrit à la main : un zip non compressé de quelques fichiers XML ----------
  function xml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function paragrapheXml(p) {
    // L'ordre des éléments est imposé par la norme Word : spacing, puis ind, puis jc
    var pPr = {
      entete: '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>',
      titre: '<w:spacing w:before="720" w:after="480"/><w:jc w:val="center"/>',
      corps: '<w:spacing w:after="280" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>',
      signature: '<w:spacing w:before="480" w:after="0"/><w:ind w:left="5040"/>'
    }[p.style];
    var rPr = { titre: '<w:b/><w:sz w:val="32"/>', entete: '<w:sz w:val="18"/>' }[p.style] || '';
    return p.texte.split('\n').map(function (ligne, i) {
      var gras = p.style === 'entete' && i === 0 ? '<w:b/>' : '';
      var pp = p.style === 'signature' && i > 0 ? pPr.replace('w:before="480"', 'w:before="0"') : pPr;
      return '<w:p><w:pPr>' + pp + '</w:pPr><w:r>' + (gras + rPr ? '<w:rPr>' + gras + rPr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(ligne) + '</w:t></w:r></w:p>';
    }).join('');
  }

  // Logo centré en haut de page (image PNG jointe au document)
  function logoXml(l) {
    var cx = Math.round(l.largeurCm * 360000), cy = Math.round(l.largeurCm * l.hauteur / l.largeur * 360000);
    return '<w:p><w:pPr><w:spacing w:after="360"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="1" name="Logo Partenord Habitat"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  function documentXml(d, logo) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' +
      (logo ? logoXml(logo) : '') +
      pouvoir(d).map(paragrapheXml).join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
  }

  var FICHIERS_FIXES = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>'
  };

  var TABLE_CRC = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(octets) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Archive zip sans compression (format « stored »), suffisante pour Word
  function zip(fichiers) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
    Object.keys(fichiers).forEach(function (nom) {
      var nomO = enc.encode(nom), data = typeof fichiers[nom] === 'string' ? enc.encode(fichiers[nom]) : fichiers[nom], crc = crc32(data);
      var entete = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nomO.length), u16(0));
      parts.push(new Uint8Array(entete), nomO, data);
      central.push(new Uint8Array([].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nomO.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), nomO);
      offset += entete.length + nomO.length + data.length;
    });
    var tailleCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
    var finCentral = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(Object.keys(fichiers).length), u16(Object.keys(fichiers).length), u32(tailleCentral), u32(offset), u16(0)));
    var tout = parts.concat(central, [finCentral]);
    var total = tout.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(total), pos = 0;
    tout.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  // logo (facultatif) : { png: Uint8Array, largeur, hauteur (pixels), largeurCm }
  function docx(d, logo) {
    var f = Object.assign({}, FICHIERS_FIXES, { 'word/document.xml': documentXml(d, logo) });
    if (logo) {
      f['word/media/logo.png'] = logo.png;
      f['word/_rels/document.xml.rels'] = f['word/_rels/document.xml.rels'].replace('</Relationships>',
        '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>');
    }
    return zip(f);
  }

  var api = { DEFAUT: DEFAUT, extraire: extraire, mandataireConnu: mandataireConnu, pouvoir: pouvoir, pouvoirTexte: pouvoirTexte, docx: docx, zip: zip, dateCourte: dateCourte };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conciliation = api;
})(this);
