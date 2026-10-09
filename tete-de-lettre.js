/* Réponse sur la tête de lettre de l'agence (fichier Word modeles/tete-de-lettre-lille.docx) :
   le modèle est ouvert dans le navigateur, le destinataire, la date, l'objet, le texte et la
   signature y sont déposés, puis le fichier est reconstitué. Aucune donnée ne quitte le navigateur. */
(function (root) {
  'use strict';

  // ---------- Destinataires connus (adresse du courrier de l'élu, à renvoyer) ----------
  // re : repère dans le texte lu (nom du signataire, adresse). lignes : 4 lignes de l'adresse.
  var DESTINATAIRES = [
    { re: /CAREMELLE|59461|72\s+Av\.?(?:enue)?\s+de\s+la\s+R[ée]publique/i,
      lignes: ['Monsieur Olivier CAREMELLE', 'Maire de Lomme', '72 avenue de la République', 'BP 159 - 59461 LOMME Cedex'] },
    { re: /DESLANDES|CS\s?30667|59033/i,
      lignes: ['Monsieur Arnaud DESLANDES', 'Maire de Lille', 'Hôtel de Ville - CS 30667', '59033 LILLE Cedex'] }
  ];

  function destinataireDepuisTexte(texte) {
    var t = String(texte || '');
    for (var i = 0; i < DESTINATAIRES.length; i++) {
      if (DESTINATAIRES[i].re.test(t)) return DESTINATAIRES[i].lignes.join('\n');
    }
    return '';
  }

  // ---------- Découpage du texte de la réponse ----------
  function decouper(texte) {
    var lignes = String(texte || '').split('\n');
    var iObjet = lignes.findIndex(function (l) { return /^Objet\s?:/.test(l); });
    var iSignature = lignes.length;
    while (iSignature > 0 && lignes[iSignature - 1].trim()) iSignature--;
    var iAppel = iObjet;
    for (var k = iObjet + 1; k < iSignature; k++) if (lignes[k].trim()) { iAppel = k; break; }
    var entete = lignes.slice(0, Math.max(iObjet, 0));
    var corps = [], cur = [];
    lignes.slice(iAppel, iSignature).forEach(function (l) {
      if (l.trim()) cur.push(l.trim());
      else if (cur.length) { corps.push(cur.join(' ')); cur = []; }
    });
    if (cur.length) corps.push(cur.join(' '));
    function valeur(re) {
      var l = entete.filter(function (x) { return re.test(x); })[0] || '';
      return l.replace(re, '').trim();
    }
    return {
      date: (entete[0] || '').trim(),
      reference: valeur(/^Nos r[ée]f\.?\s?:/),
      suiviPar: valeur(/^Affaire suivie par\s?:/),
      objet: iObjet >= 0 ? lignes[iObjet].replace(/^Objet\s?:\s*/, '').trim() : '',
      corps: corps,
      signature: lignes.slice(iSignature).filter(function (l) { return l.trim(); })
    };
  }

  // ---------- Lecture d'un fichier zip (le modèle Word est compressé) ----------
  async function inflater(octets) {
    var flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  async function lireZip(o) {
    var v = new DataView(o.buffer, o.byteOffset, o.byteLength), dec = new TextDecoder();
    var fin = o.length - 22;
    while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
    if (fin < 0) throw new Error('Fichier Word illisible');
    var n = v.getUint16(fin + 10, true), pos = v.getUint32(fin + 16, true), fichiers = {};
    for (var i = 0; i < n; i++) {
      var methode = v.getUint16(pos + 10, true), taille = v.getUint32(pos + 20, true);
      var lNom = v.getUint16(pos + 28, true), lExtra = v.getUint16(pos + 30, true), lCom = v.getUint16(pos + 32, true);
      var local = v.getUint32(pos + 42, true), nom = dec.decode(o.subarray(pos + 46, pos + 46 + lNom));
      pos += 46 + lNom + lExtra + lCom;
      if (/\/$/.test(nom)) continue;
      var debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      var data = o.subarray(debut, debut + taille);
      fichiers[nom] = methode === 0 ? data : await inflater(data);
    }
    return fichiers;
  }

  // ---------- Remplissage du document ----------
  function xml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var POLICE = '<w:rFonts w:ascii="Roboto" w:hAnsi="Roboto"/>';

  function paragraphe(texte, pPr, rPr) {
    return '<w:p><w:pPr>' + pPr + '<w:rPr>' + POLICE + '</w:rPr></w:pPr>' +
      (texte ? '<w:r><w:rPr>' + POLICE + (rPr || '') + '</w:rPr><w:t xml:space="preserve">' + xml(texte) + '</w:t></w:r>' : '') + '</w:p>';
  }

  // Remplace le texte d'un paragraphe du modèle repéré par son contenu
  function remplacerTexte(s, ancien, nouveau) {
    var i = s.indexOf(ancien);
    if (i < 0) throw new Error('Modèle Word inattendu : « ' + ancien + ' » introuvable');
    return s.slice(0, i) + nouveau + s.slice(i + ancien.length);
  }

  function debutParagraphe(s, i) { return s.lastIndexOf('<w:p ', i); }
  function finParagraphe(s, i) { return s.indexOf('</w:p>', i) + 6; }

  function documentXml(modele, d) {
    var s = modele;
    // Destinataire : 4 lignes, présentes deux fois (zone de texte et son repli)
    var adr = String(d.destinataire || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    ['Monsieur Prénom Nom', 'Résidence - Appartement', 'Adresse', 'CP VILLE'].forEach(function (ancien, i) {
      var re = new RegExp('(<w:t[^>]*>)' + ancien + '(</w:t>)', 'g');
      if (!re.test(s)) throw new Error('Modèle Word inattendu : « ' + ancien + ' » introuvable');
      s = s.replace(re, function (m, a, b) { return a + xml(adr[i] || '') + b; });
    });
    // Date
    s = s.replace(/(<w:t[^>]*>)Ville, date\s*(<\/w:t>)/, function (m, a, b) { return a + xml(d.date) + b; });
    // Nos réf. / Affaire suivie par, juste après la date (avant l'objet)
    var infos = '';
    if (d.reference) infos += paragraphe('Nos réf. : ' + d.reference, '<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>');
    if (d.suiviPar) infos += paragraphe('Affaire suivie par : ' + d.suiviPar, '<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>');
    // Objet : remplace tout le paragraphe « Objet : »
    var iObjet = s.search(/<w:t[^>]*>Objet[\s ]*:[\s ]*<\/w:t>/);
    if (iObjet < 0) throw new Error('Modèle Word inattendu : « Objet » introuvable');
    var a = debutParagraphe(s, iObjet), b = finParagraphe(s, iObjet);
    var objet = '<w:p><w:pPr><w:spacing w:before="360" w:after="360" w:line="276" w:lineRule="auto"/><w:rPr>' + POLICE + '</w:rPr></w:pPr>' +
      '<w:r><w:rPr>' + POLICE + '<w:u w:val="single"/></w:rPr><w:t xml:space="preserve">Objet :</w:t></w:r>' +
      '<w:r><w:rPr>' + POLICE + '</w:rPr><w:t xml:space="preserve"> ' + xml(d.objet) + '</w:t></w:r></w:p>';
    s = s.slice(0, a) + infos + objet + s.slice(b);
    // Corps : du paragraphe « Madame, Monsieur, » jusqu'au paragraphe « Signature » (exclu)
    var iAppel = s.indexOf('<w:t>Madame, Monsieur,</w:t>'), iSig = s.indexOf('<w:t>Signature</w:t>');
    if (iAppel < 0 || iSig < 0) throw new Error('Modèle Word inattendu : corps ou signature introuvable');
    var debutCorps = debutParagraphe(s, iAppel), debutSig = debutParagraphe(s, iSig), finSig = finParagraphe(s, iSig);
    var corps = d.corps.map(function (p, i) {
      return paragraphe(p, '<w:spacing w:after="200" w:line="276" w:lineRule="auto"/>' + (i === 0 ? '' : '<w:jc w:val="both"/>'));
    }).join('');
    var signature = d.signature.map(function (l, i) {
      return paragraphe(l, '<w:keepNext/><w:spacing w:before="' + (i === 0 ? 360 : 0) + '" w:after="0"/><w:ind w:left="5387"/>');
    }).join('');
    return s.slice(0, debutCorps) + corps + signature + s.slice(finSig);
  }

  // modele : Uint8Array du .docx ; d : { destinataire, texte (réponse générée), ... } -> Uint8Array
  async function remplir(modele, d, zip) {
    var f = await lireZip(modele), dec = new TextDecoder();
    var t = decouper(d.texte);
    f['word/document.xml'] = documentXml(dec.decode(f['word/document.xml']), {
      destinataire: d.destinataire, date: t.date, reference: t.reference, suiviPar: t.suiviPar,
      objet: t.objet, corps: t.corps, signature: t.signature
    });
    return zip(f);
  }

  var api = { DESTINATAIRES: DESTINATAIRES, destinataireDepuisTexte: destinataireDepuisTexte, decouper: decouper, lireZip: lireZip, documentXml: documentXml, remplir: remplir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeteDeLettre = api;
})(this);
