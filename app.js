(function () {
  'use strict';
  var L = window.Lettre;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Réglages (navigateur uniquement) ----------
  var DEFAUT = {
    suiviPar: "Romy DOISNE - Commerciale d'agence",
    ville: 'Lille',
    signature: 'Eric COJON\nDirecteur Général\n#signature#',
    agences: [{
      nom: 'Lille',
      adresse: '2 bis rue Georges Courteline à Lille',
      horaires: 'du lundi au vendredi de 9h00 à 12h30 et de 13h30 à 17h00',
      communes: ['Lille']
    }]
  };
  // Rien n'est conservé dans le navigateur : les réglages valent jusqu'à la fermeture de la page
  // (pour les retrouver, les exporter puis les importer à la prochaine ouverture).
  var reglages = JSON.parse(JSON.stringify(DEFAUT));

  // Efface ce que d'anciennes versions du site avaient pu enregistrer sur le poste
  try {
    localStorage.removeItem('reponses-logement');
    localStorage.removeItem('reponses-logement-vue');
  } catch (e) { /* stockage indisponible */ }
  try { if (window.indexedDB) indexedDB.deleteDatabase('keyval-store'); } catch (e) { /* idem */ }

  // ---------- Construction des contrôles ----------
  Object.keys(L.PROFILS).forEach(function (k, i) {
    var lab = document.createElement('label');
    lab.innerHTML = '<input type="radio" name="profil" value="' + k + '"' + (k === 'MF' ? ' checked' : '') + '>' + L.PROFILS[k].label;
    $('profil').appendChild(lab);
  });
  Object.keys(L.FONCTIONS).forEach(function (k) {
    var o = document.createElement('option');
    o.value = k; o.textContent = L.FONCTIONS[k].label;
    $('fonction').appendChild(o);
  });
  L.CRITERES.forEach(function (c) {
    var lab = document.createElement('label');
    lab.className = 'chip';
    lab.innerHTML = '<input type="checkbox" value="' + c.id + '"> ' + c.texte;
    $('criteres').appendChild(lab);
  });
  function remplirAgences() {
    var sel = $('agence'), actuelle = sel.value;
    sel.innerHTML = '';
    reglages.agences.forEach(function (a, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = a.nom;
      sel.appendChild(o);
    });
    if (actuelle && reglages.agences[actuelle]) sel.value = actuelle;
    var liste = $('liste-agences');
    liste.innerHTML = '';
    reglages.agences.forEach(function (a, i) {
      var div = document.createElement('div');
      div.className = 'agence-ligne';
      div.innerHTML = '<div><b></b><span></span><span></span></div><div><button type="button" data-edit="' + i + '">Modifier</button> <button type="button" data-suppr="' + i + '">Supprimer</button></div>';
      div.querySelector('b').textContent = a.nom;
      div.querySelectorAll('span')[0].textContent = a.adresse + ' — ' + a.horaires;
      div.querySelectorAll('span')[1].textContent = 'Communes : ' + (a.communes || []).join(', ');
      liste.appendChild(div);
    });
  }
  remplirAgences();
  $('date').value = L.dateLongue(new Date());

  // ---------- Lecture du courrier ----------
  var worker = null;
  // Message d'avancement dans l'onglet affiché
  function etat(html) { ($('vue-logement').hidden ? $('c-etat') : $('etat')).innerHTML = html; }

  async function ocr(images) {
    if (!worker) {
      etat('Chargement de la reconnaissance de texte (première fois : quelques secondes)… <progress></progress>');
      // Tout est servi par le site lui-même (dossier vendor/) : aucun appel à un service externe
      var base = new URL('vendor/tesseract/', document.baseURI).href;
      worker = await Tesseract.createWorker('fra', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core/',
        langPath: base + 'lang',
        cacheMethod: 'none', // le dictionnaire n'est pas enregistré sur le poste
        logger: function (m) {
          if (m.status === 'recognizing text') etat('Lecture du courrier… <progress value="' + m.progress + '"></progress>');
        }
      });
    }
    var texte = '';
    for (var i = 0; i < images.length; i++) {
      etat('Lecture de la page ' + (i + 1) + '/' + images.length + '… <progress></progress>');
      var r = await worker.recognize(images[i]);
      texte += r.data.text + '\n';
    }
    return texte;
  }

  async function lirePdf(buffer) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    var pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    var nb = Math.min(pdf.numPages, 5);
    var texte = '', pages = [];
    for (var i = 1; i <= nb; i++) {
      var page = await pdf.getPage(i);
      var contenu = await page.getTextContent();
      texte += contenu.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join('') + '\n';
      pages.push(page);
    }
    // PDF texte : pas besoin d'OCR
    if (texte.replace(/\s/g, '').length > 300) return texte;
    var images = [];
    for (var j = 0; j < pages.length; j++) {
      var vp = pages[j].getViewport({ scale: 2.5 });
      var canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await pages[j].render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      images.push(canvas);
    }
    return ocr(images);
  }

  // ---------- File de courriers ----------
  // Chaque courrier déposé garde ses propres champs : passer de l'un à l'autre n'écrase rien.
  var courriers = [], actif = -1, enCours = Promise.resolve();

  function echapperHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function lireChamps() {
    return {
      designation: $('designation').value, numero: $('numero').value, typologie: $('typologie').value,
      lieu: $('lieu').value, critereLibre: $('critere-libre').value, fonction: $('fonction').value,
      nature: $('nature').value, agence: $('agence').value, reference: $('reference').value, date: $('date').value,
      destinataire: $('destinataire').value,
      profil: document.querySelector('input[name=profil]:checked').value,
      elu: document.querySelector('input[name=elu]:checked').value,
      criteres: Array.prototype.map.call(document.querySelectorAll('#criteres input:checked'), function (cb) { return cb.value; }),
      texte: $('texte-source').value, alerte: champsCourants.alerte || ''
    };
  }
  var champsCourants = {};

  function ecrireChamps(c) {
    champsCourants = c;
    ['designation', 'numero', 'typologie', 'lieu', 'fonction', 'nature', 'reference', 'date'].forEach(function (id) { $(id).value = c[id]; });
    $('destinataire').value = c.destinataire || '';
    $('critere-libre').value = c.critereLibre;
    if (reglages.agences[c.agence]) $('agence').value = c.agence;
    document.querySelector('input[name=profil][value=' + c.profil + ']').checked = true;
    document.querySelector('input[name=elu][value=' + c.elu + ']').checked = true;
    document.querySelectorAll('#criteres input').forEach(function (cb) { cb.checked = c.criteres.indexOf(cb.value) >= 0; });
    $('texte-source').value = c.texte;
    $('alerte').textContent = c.alerte || '';
    $('alerte').hidden = !c.alerte;
    maj();
  }

  // Champs proposés pour un texte de courrier (sans toucher à la page)
  function champsDepuisTexte(texte, nomFichier) {
    // Le signataire et la personne qui suit l'affaire ne sont jamais le demandeur
    var r = L.extraire(texte, { exclus: [reglages.signature.split('\n')[0], reglages.suiviPar.split(' - ')[0]] });
    // Agence rattachée à la commune souhaitée
    var agence = $('agence').value;
    var lieu = (r.lieu || '').replace(/\s(?:ou|et)\s.*$/, '').toLowerCase();
    reglages.agences.forEach(function (a, i) {
      if ((a.communes || []).some(function (c) { return c.trim().toLowerCase() === lieu; })) agence = String(i);
    });
    // « Q_12192_0.pdf » -> Nos réf. : 12192
    var ref = nomFichier ? /(?:^|[^A-Za-z0-9])Q[_ -]?(\d{3,})/i.exec(nomFichier) : null;
    return {
      designation: r.designation, numero: r.numero, typologie: r.typologie, lieu: r.lieu, critereLibre: '',
      fonction: r.fonction, nature: r.mutation ? 'mutation' : 'logement', agence: agence,
      reference: ref ? ref[1] : (nomFichier ? '' : $('reference').value), date: $('date').value,
      destinataire: window.TeteDeLettre ? window.TeteDeLettre.destinataireDepuisTexte(texte) : '',
      profil: r.profil, elu: r.elueFem ? 'f' : 'm', criteres: r.criteres, texte: texte,
      alerte: r.variantes && r.variantes.length ? 'Orthographe à vérifier : le courrier écrit aussi « ' + r.variantes.join(' », « ') + ' ».' : ''
    };
  }

  function afficherListe() {
    var ul = $('liste-courriers');
    $('bloc-courriers').hidden = courriers.length < 2 && !courriers.some(function (c) { return c.statut !== 'pret'; });
    ul.innerHTML = '';
    courriers.forEach(function (c, i) {
      var li = document.createElement('li');
      li.className = (i === actif ? 'actif ' : '') + c.statut + (c.copie ? ' copie' : '');
      var nom = c.champs && c.champs.designation ? c.champs.designation : '';
      var etatTxt = { lecture: 'lecture…', attente: 'en attente', erreur: 'illisible', pret: c.copie ? '✓ copié' : 'à traiter' }[c.statut];
      li.innerHTML = '<button type="button" data-i="' + i + '"' + (c.statut === 'pret' || c.statut === 'erreur' ? '' : ' disabled') + '><b></b><span></span></button>' +
        '<em>' + etatTxt + '</em><button type="button" class="suppr" data-suppr-courrier="' + i + '" aria-label="Retirer ce courrier">×</button>';
      li.querySelector('b').textContent = c.nom;
      li.querySelector('span').textContent = nom;
      ul.appendChild(li);
    });
    var restants = courriers.filter(function (c) { return !c.copie; }).length;
    $('compte-courriers').textContent = courriers.length + ' courrier' + (courriers.length > 1 ? 's' : '') + (restants ? ' — ' + restants + ' à traiter' : ' — tous copiés');
  }

  function ouvrir(i) {
    if (actif >= 0 && courriers[actif] && courriers[actif].statut === 'pret') courriers[actif].champs = lireChamps();
    actif = i;
    var c = courriers[i];
    if (c.statut === 'pret') {
      ecrireChamps(c.champs);
      etat('<span style="color:var(--ok)">✓ « ' + echapperHtml(c.nom) + ' » lu. Vérifiez les champs surlignés.</span>');
    } else if (c.statut === 'erreur') {
      etat('<span style="color:var(--warn)">Impossible de lire « ' + echapperHtml(c.nom) + ' » (' + echapperHtml(c.erreur) + '). Vous pouvez coller son texte ci-dessous.</span>');
    }
    afficherListe();
  }

  async function lireFichier(f) {
    return /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? lirePdf(await f.arrayBuffer()) : ocr([f]);
  }

  function ajouterFichiers(liste) {
    Array.prototype.forEach.call(liste || [], function (f, rang) {
      var c = { nom: f.name, statut: 'attente', copie: false };
      courriers.push(c);
      // Lecture l'une après l'autre (un seul moteur de lecture)
      enCours = enCours.then(async function () {
        c.statut = 'lecture'; afficherListe();
        etat('Ouverture de « ' + echapperHtml(f.name) + ' »…');
        try {
          var texte = await lireFichier(f);
          c.champs = champsDepuisTexte(texte, f.name);
          c.statut = 'pret';
        } catch (e) {
          console.error(e);
          c.statut = 'erreur'; c.erreur = String(e.message || e);
        }
        var idx = courriers.indexOf(c);
        // Le premier courrier de chaque dépôt s'affiche ; les suivants attendent dans la liste
        if (idx >= 0 && (rang === 0 || actif < 0 || !courriers[actif] || courriers[actif].statut !== 'pret')) ouvrir(idx);
        else { afficherListe(); etat('<span style="color:var(--ok)">✓ « ' + echapperHtml(f.name) + ' » lu : cliquez dessus dans la liste pour l\'afficher.</span>'); }
      });
    });
    afficherListe();
  }

  // ---------- Remplissage à partir d'un texte collé ----------
  function analyser(texte) {
    var c = champsDepuisTexte(texte, null);
    ecrireChamps(c);
    if (actif >= 0 && courriers[actif]) { courriers[actif].champs = c; courriers[actif].statut = 'pret'; afficherListe(); }
  }

  // ---------- Génération ----------
  var S = '\u0001', E = '\u0002';
  function donnees(marquer) {
    var w = function (v) { v = v.trim(); return marquer && v ? S + v + E : v; };
    var crit = [], critLog = [];
    document.querySelectorAll('#criteres input:checked').forEach(function (cb) {
      var c = L.CRITERES.filter(function (x) { return x.id === cb.value; })[0];
      (c.logement ? critLog : crit).push(c.texte);
    });
    if ($('critere-libre').value.trim()) crit.push($('critere-libre').value.trim());
    return {
      profil: document.querySelector('input[name=profil]:checked').value,
      designation: w($('designation').value),
      numero: w($('numero').value),
      typologie: w($('typologie').value),
      lieu: w($('lieu').value),
      criteresTextes: crit.map(w),
      criteresLogement: critLog.map(w),
      fonction: $('fonction').value,
      elueFem: document.querySelector('input[name=elu]:checked').value === 'f',
      mutation: $('nature').value === 'mutation',
      agence: reglages.agences[$('agence').value] || {},
      reference: $('reference').value.trim(),
      date: $('date').value.trim(),
      ville: reglages.ville,
      suiviPar: reglages.suiviPar,
      signature: reglages.signature
    };
  }

  function echapper(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function maj() {
    var html = echapper(L.generer(donnees(true)))
      .replace(/\u0001([^\u0002]*)\u0002/g, '<span class="var">$1</span>')
      .replace(/\[(DEMANDEUR|TYPE|AGENCE)\]/g, '<span class="trou">[$1]</span>');
    $('lettre').innerHTML = html;
    ['designation', 'numero', 'typologie', 'lieu', 'destinataire'].forEach(function (id) {
      $(id).classList.toggle('manquant', !$(id).value.trim());
    });
  }

  function texteFinal(partie) {
    var t = L.generer(donnees(false));
    var lignes = t.split('\n');
    if (partie === 'objet') return lignes.filter(function (l) { return /^Objet :/.test(l); })[0] || '';
    if (partie === 'corps') {
      var i = lignes.findIndex(function (l) { return /^Objet :/.test(l); });
      i = lignes.findIndex(function (l, k) { return k > i && l.trim(); });
      return lignes.slice(i).join('\n');
    }
    return t;
  }

  // Copie en texte brut et en HTML (le PGI lit le HTML). Les variantes de l'encadré
  // « Essais de collage » servent à trouver le format que le PGI respecte le mieux.
  var DECALAGE = '9cm';
  function aDecaler(lignes, lettre) {
    var debutSignature = lignes.length;
    if (lettre) while (debutSignature > 0 && lignes[debutSignature - 1].trim()) debutSignature--;
    return function (l, i) { return lettre && (i >= debutSignature || (i === 0 && /, le /.test(l))); };
  }

  function versHtml(t, lettre, variante) {
    var lignes = t.split('\n');
    var decale = aDecaler(lignes, lettre);
    var police = 'font-family:Roboto,Arial,sans-serif;font-size:11pt;';
    if (variante === 'word') {
      // Même forme que le HTML copié depuis Word
      return '<html><head><meta charset="utf-8"><style>p.MsoNormal{margin:0cm;margin-bottom:.0001pt;' + police + '}</style></head><body>' +
        lignes.map(function (l, i) {
          return '<p class="MsoNormal" style="margin:0cm;margin-bottom:.0001pt;text-align:' + (decale(l, i) ? 'left;margin-left:' + DECALAGE : 'justify') + '">' +
            (l.trim() ? echapper(l) : '&nbsp;') + '<o:p></o:p></p>';
        }).join('') + '</body></html>';
    }
    if (variante === 'paragraphes') {
      // Un vrai paragraphe <p> par ligne, comme les courriers tapés dans le PGI ;
      // interligne simple et espacements nuls écrits de toutes les façons courantes.
      return lignes.map(function (l, i) {
        var style = 'margin:0pt 0pt 0pt ' + (decale(l, i) ? DECALAGE : '0pt') + ';margin-top:0pt;margin-bottom:0pt;' +
          'mso-margin-top-alt:0pt;mso-margin-bottom-alt:0pt;mso-para-margin:0pt;text-indent:0pt;' +
          'line-height:100%;mso-line-height-rule:exactly;' + police +
          'text-align:' + (decale(l, i) ? 'left' : 'justify');
        return '<p style="' + style + '">' + (l.trim() ? echapper(l) : '&nbsp;') + '</p>';
      }).join('');
    }
    // Format par défaut : un bloc <div> par ligne. Le PGI les colle en un seul paragraphe
    // à lignes serrées, mais le justifie et étire les lignes courtes (« Nos réf. »,
    // « Monsieur le Maire, »…) : leurs espaces deviennent insécables, que la justification
    // n'élargit pas. Le PGI ignore les tabulations : la date et la signature sont décalées
    // par des espaces insécables.
    return '<div style="' + police + '">' + lignes.map(function (l, i) {
      return '<div style="margin:0cm;text-indent:0cm;text-align:left">' + (l.trim() ? echapper(lettre ? ligneFigee(l, decale(l, i)) : l) : '&nbsp;') + '</div>';
    }).join('') + '</div>';
  }

  // Le PGI justifie le paragraphe collé et étire toute ligne qui finit par un retour à
  // la ligne : la dernière ligne de chaque paragraphe du courrier, et les lignes courtes.
  // On calcule donc, avec la police Roboto du PGI, où il coupera les lignes, et la
  // dernière ligne reçoit des espaces insécables, que la justification n'élargit pas.
  // Largeur de la ligne du PGI, en cadratins (mesurée sur ses coupures de ligne).
  var LARGEUR_LIGNE = 43.58;
  var RETRAIT = new Array(94).join('\u00a0');   // ≈ 9 cm en Roboto 11 pt
  var mesurer = null;
  try {
    var roboto = new FontFace('RobotoMesure', 'url(vendor/roboto/roboto-latin-400-normal.woff2)');
    roboto.load().then(function () {
      document.fonts.add(roboto);
      var ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '100px RobotoMesure';
      mesurer = function (t) { return ctx.measureText(t).width / 100; };
    }).catch(function () { /* sans la police : règle approchée ci-dessous */ });
  } catch (e) { /* idem */ }

  // Réservé aux lettres de réponse (modèle du PGI en Roboto 11) : le texte du pouvoir
  // est collé dans une autre police, où ces fins de ligne figées déborderaient à droite.
  function ligneFigee(l, decale) {
    var insec = function (t) { return t.replace(/ /g, '\u00a0'); };
    var prefixe = decale ? RETRAIT : '';
    if (!mesurer) return l.length > 90 ? l : prefixe + insec(l);
    if (mesurer(l) <= LARGEUR_LIGNE) return prefixe + insec(l);
    // Coupure des lignes comme le PGI (au plus grand nombre de mots qui tiennent)
    var mots = l.split(' '), debut = 0, i = 1;
    for (; i < mots.length; i++) {
      if (mesurer(mots.slice(debut, i + 1).join(' ')) > LARGEUR_LIGNE) debut = i;
    }
    return mots.slice(0, debut).join(' ') + (debut ? ' ' : '') + insec(mots.slice(debut).join(' '));
  }

  async function copierTexte(t, lettre, variante) {
    // Le PGI transforme chaque ligne vide en changement de paragraphe, avec un grand
    // espace et un retrait : une espace insécable garde la ligne vide sans la couper.
    t = t.split('\n').map(function (l) { return l.trim() ? l : '\u00a0'; }).join('\n');
    var formats = { 'text/plain': t };
    if (variante === 'texte') {
      // Texte seul, lignes séparées par le séparateur de paragraphe Unicode
      formats['text/plain'] = t.split('\n').join('\u2029');
    } else {
      if (!variante || variante === 'actuel') {
        var lignes = t.split('\n'), decale = aDecaler(lignes, lettre);
        formats['text/plain'] = lignes.map(function (l, i) { return l.trim() && lettre ? ligneFigee(l, decale(l, i)) : l; }).join('\n');
      }
      formats['text/html'] = versHtml(t, lettre, variante);
    }
    // navigator.clipboard.write d'abord : le navigateur y réécrit le HTML avec tous les
    // styles calculés, et c'est cette version que le PGI colle sans grands espaces.
    // L'événement « copy » (HTML copié tel quel) ne sert qu'en repli.
    try {
      var items = {};
      Object.keys(formats).forEach(function (k) { items[k] = new Blob([formats[k]], { type: k }); });
      await navigator.clipboard.write([new ClipboardItem(items)]);
    } catch (e) {
      var ecrire = function (ev) {
        Object.keys(formats).forEach(function (k) { ev.clipboardData.setData(k, formats[k]); });
        ev.preventDefault();
      };
      document.addEventListener('copy', ecrire);
      document.execCommand('copy');
      document.removeEventListener('copy', ecrire);
    }
  }

  async function copier(partie) {
    await copierTexte(texteFinal(partie), partie !== 'objet');
    $('copie-ok').textContent = '✓ Copié';
    if (actif >= 0 && courriers[actif] && partie !== 'objet') { courriers[actif].copie = true; afficherListe(); }
    setTimeout(function () { $('copie-ok').textContent = ''; }, 2000);
  }

  // Réponse sur la tête de lettre de l'agence (modèle Word déposé dans modeles/)
  var modeleWord = null;
  async function telechargerWord() {
    var T = window.TeteDeLettre;
    try {
      if (!modeleWord) {
        var rep = await fetch('modeles/tete-de-lettre-lille.docx');
        if (!rep.ok) throw new Error('modèle introuvable');
        modeleWord = new Uint8Array(await rep.arrayBuffer());
      }
      var octets = await T.remplir(modeleWord, { destinataire: $('destinataire').value, texte: texteFinal('tout') }, window.Conciliation.zip);
      // nom de famille = mots en capitales, sinon dernier mot de la désignation
      var mots = $('designation').value.trim().split(/\s+/).slice(1);
      var nom = (mots.filter(function (w) { return w.length > 1 && w === w.toUpperCase(); }).join(' ') || mots.pop() || 'courrier').replace(/[^\wÀ-ÿ' -]/g, '');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      a.download = 'Réponse - ' + nom + '.docx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      $('copie-ok').textContent = '✓ Fichier Word téléchargé';
      if (actif >= 0 && courriers[actif]) { courriers[actif].copie = true; afficherListe(); }
    } catch (e) {
      console.error(e);
      $('copie-ok').textContent = 'Word impossible : ' + (e.message || e);
    }
    setTimeout(function () { $('copie-ok').textContent = ''; }, 3000);
  }

  // ---------- Événements ----------
  $('btn-word').addEventListener('click', telechargerWord);
  var drop = $('drop');
  drop.addEventListener('click', function () { $('fichier').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fichier').click(); } });
  $('fichier').addEventListener('change', function () { ajouterFichiers(this.files); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { ajouterFichiers(e.dataTransfer.files); });
  // Dépôt n'importe où sur la page (onglet Demandes de logement)
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('verrouille')) return;
    if (!$('vue-logement').hidden && !drop.contains(e.target)) ajouterFichiers(e.dataTransfer.files);
  });

  // Onglets : Demandes de logement / Conciliations
  function afficherVue(v) {
    if (v !== 'conciliation') v = 'logement';
    $('vue-logement').hidden = v !== 'logement';
    $('vue-conciliation').hidden = v !== 'conciliation';
    document.querySelectorAll('.onglets button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vue === v)); });
  }
  document.querySelectorAll('.onglets button').forEach(function (b) {
    b.addEventListener('click', function () { afficherVue(b.dataset.vue); });
  });
  afficherVue('logement');

  // Lecture des fichiers partagée avec l'onglet Conciliations
  window.Lecture = { lireFichier: lireFichier };
  window.Presse = { copierTexte: copierTexte };

  $('liste-courriers').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.supprCourrier != null) {
      var i = +b.dataset.supprCourrier;
      if (courriers[i].statut === 'lecture' || courriers[i].statut === 'attente') return;
      courriers.splice(i, 1);
      if (actif === i) actif = -1; else if (actif > i) actif--;
      afficherListe();
    } else if (b.dataset.i != null) ouvrir(+b.dataset.i);
  });
  $('btn-analyser').addEventListener('click', function () { analyser($('texte-source').value); });
  document.querySelector('main').addEventListener('input', maj);
  document.querySelector('main').addEventListener('change', maj);
  document.querySelectorAll('[data-copie]').forEach(function (b) {
    b.addEventListener('click', function () { copier(b.dataset.copie); });
  });
  document.querySelectorAll('[data-essai]').forEach(function (b) {
    b.addEventListener('click', async function () {
      await copierTexte(texteFinal('tout'), true, b.dataset.essai);
      $('copie-ok').textContent = '✓ Copié (essai ' + b.textContent.trim().charAt(0) + ')';
      setTimeout(function () { $('copie-ok').textContent = ''; }, 2000);
    });
  });

  // Réglages
  var dlg = $('reglages');
  $('btn-reglages').addEventListener('click', function () {
    $('r-suivi').value = reglages.suiviPar;
    $('r-ville').value = reglages.ville;
    $('r-signature').value = reglages.signature;
    $('r-message').textContent = '';
    dlg.showModal();
  });
  // Enregistré à chaque fermeture, y compris avec la touche Échap
  $('r-fermer').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () {
    reglages.suiviPar = $('r-suivi').value;
    reglages.ville = $('r-ville').value.trim() || 'Lille';
    reglages.signature = $('r-signature').value.replace(/\s+$/, '') || DEFAUT.signature;
    maj();
  });

  // Partage des réglages entre collègues (fichier JSON)
  $('r-exporter').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(reglages, null, 2)], { type: 'application/json' }));
    a.download = 'reglages-reponses-logement.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('r-importer').addEventListener('click', function () { $('r-fichier').click(); });
  $('r-fichier').addEventListener('change', async function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    try {
      var r = JSON.parse(await f.text());
      if (!r || !Array.isArray(r.agences) || !r.agences.length || !r.agences.every(function (a) { return a && typeof a.nom === 'string'; })) throw new Error('format');
      reglages = Object.assign({}, DEFAUT, r);
      $('r-suivi').value = reglages.suiviPar;
      $('r-ville').value = reglages.ville;
      $('r-signature').value = reglages.signature;
      remplirAgences(); maj();
      $('r-message').textContent = '✓ Réglages importés (' + reglages.agences.length + ' agence' + (reglages.agences.length > 1 ? 's' : '') + ').';
    } catch (e) {
      $('r-message').textContent = 'Ce fichier n\'est pas un fichier de réglages valide.';
    }
  });
  $('a-enregistrer').addEventListener('click', function () {
    var a = {
      nom: $('a-nom').value.trim(),
      adresse: $('a-adresse').value.trim(),
      horaires: $('a-horaires').value.trim(),
      communes: $('a-communes').value.split(',').map(function (c) { return c.trim(); }).filter(Boolean)
    };
    if (!a.nom) return;
    var i = reglages.agences.findIndex(function (x) { return x.nom.toLowerCase() === a.nom.toLowerCase(); });
    if (i >= 0) reglages.agences[i] = a; else reglages.agences.push(a);
    ['a-nom', 'a-adresse', 'a-horaires', 'a-communes'].forEach(function (id) { $(id).value = ''; });
    remplirAgences(); maj();
  });
  $('liste-agences').addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.suppr != null && reglages.agences.length > 1 && confirm('Supprimer cette agence ?')) {
      reglages.agences.splice(+t.dataset.suppr, 1);
      remplirAgences(); maj();
    }
    if (t.dataset.edit != null) {
      var a = reglages.agences[+t.dataset.edit];
      $('a-nom').value = a.nom; $('a-adresse').value = a.adresse;
      $('a-horaires').value = a.horaires; $('a-communes').value = (a.communes || []).join(', ');
      t.closest('dialog').querySelector('details').open = true;
    }
  });

  maj();
})();
