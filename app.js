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
    ['designation', 'numero', 'typologie', 'lieu'].forEach(function (id) {
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

  // Copie en texte brut et en HTML. Dans la version HTML, chaque ligne est un vrai
  // paragraphe (<p>), pour que le PGI justifie le texte sans étirer la dernière ligne ;
  // ses marges sont écrites en cm, sinon le PGI ajoute son grand espace entre paragraphes.
  // Pour une lettre, la date et la signature sont décalées vers la droite.
  var DECALAGE = '9cm';
  function versHtml(t, lettre) {
    var lignes = t.split('\n');
    var debutSignature = lignes.length;
    if (lettre) while (debutSignature > 0 && lignes[debutSignature - 1].trim()) debutSignature--;
    return lignes.map(function (l, i) {
      var decale = lettre && (i >= debutSignature || (i === 0 && /, le /.test(l)));
      var style = 'margin:0cm;margin-top:0cm;margin-bottom:0cm;text-indent:0cm;line-height:normal;' +
        'font-family:Roboto,Arial,sans-serif;font-size:11pt;' +
        (decale ? 'text-align:left;margin-left:' + DECALAGE : 'text-align:justify');
      return '<p style="' + style + '">' + (l.trim() ? echapper(l) : '&nbsp;') + '</p>';
    }).join('');
  }

  async function copierTexte(t, lettre) {
    // Le PGI transforme chaque ligne vide en changement de paragraphe, avec un grand
    // espace et un retrait : une espace insécable garde la ligne vide sans la couper.
    t = t.split('\n').map(function (l) { return l.trim() ? l : '\u00a0'; }).join('\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([t], { type: 'text/plain' }),
        'text/html': new Blob([versHtml(t, lettre)], { type: 'text/html' })
      })]);
    } catch (e) {
      var ecrire = function (ev) {
        ev.clipboardData.setData('text/plain', t);
        ev.clipboardData.setData('text/html', versHtml(t, lettre));
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

  // ---------- Événements ----------
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
