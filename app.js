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
  var reglages;
  try { reglages = Object.assign({}, DEFAUT, JSON.parse(localStorage.getItem('reponses-logement') || '{}')); }
  catch (e) { reglages = Object.assign({}, DEFAUT); }
  function sauver() {
    try { localStorage.setItem('reponses-logement', JSON.stringify(reglages)); } catch (e) { /* stockage indisponible */ }
  }

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
  function etat(html) { $('etat').innerHTML = html; }

  async function ocr(images) {
    if (!worker) {
      etat('Chargement de la reconnaissance de texte (première fois : quelques secondes)… <progress></progress>');
      worker = await Tesseract.createWorker('fra', 1, {
        langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int',
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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

  async function traiterFichier(f) {
    if (!f) return;
    try {
      etat('Ouverture de « ' + f.name.replace(/</g, '&lt;') + ' »…');
      var texte = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)
        ? await lirePdf(await f.arrayBuffer())
        : await ocr([f]);
      $('texte-source').value = texte;
      analyser(texte);
      etat('<span style="color:var(--ok)">✓ Courrier lu. Vérifiez les champs surlignés.</span>');
    } catch (e) {
      console.error(e);
      etat('<span style="color:var(--warn)">Impossible de lire ce fichier (' + String(e.message || e).replace(/</g, '&lt;') + '). Vous pouvez coller le texte ci-dessous.</span>');
    }
  }

  // ---------- Remplissage à partir de l'analyse ----------
  function analyser(texte) {
    var r = L.extraire(texte);
    $('designation').value = r.designation;
    $('numero').value = r.numero;
    $('typologie').value = r.typologie;
    $('lieu').value = r.lieu;
    document.querySelector('input[name=profil][value=' + r.profil + ']').checked = true;
    $('fonction').value = r.fonction;
    document.querySelector('input[name=elu][value=' + (r.elueFem ? 'f' : 'm') + ']').checked = true;
    $('nature').value = r.mutation ? 'mutation' : 'logement';
    document.querySelectorAll('#criteres input').forEach(function (cb) { cb.checked = r.criteres.indexOf(cb.value) >= 0; });
    $('critere-libre').value = '';
    // Agence rattachée à la commune souhaitée
    var lieu = (r.lieu || '').toLowerCase();
    reglages.agences.forEach(function (a, i) {
      if ((a.communes || []).some(function (c) { return c.trim().toLowerCase() === lieu; })) $('agence').value = i;
    });
    maj();
  }

  // ---------- Génération ----------
  var S = '\u0001', E = '\u0002';
  function donnees(marquer) {
    var w = function (v) { v = v.trim(); return marquer && v ? S + v + E : v; };
    var crit = [];
    document.querySelectorAll('#criteres input:checked').forEach(function (cb) {
      crit.push(L.CRITERES.filter(function (c) { return c.id === cb.value; })[0].texte);
    });
    if ($('critere-libre').value.trim()) crit.push($('critere-libre').value.trim());
    return {
      profil: document.querySelector('input[name=profil]:checked').value,
      designation: w($('designation').value),
      numero: w($('numero').value),
      typologie: w($('typologie').value),
      lieu: w($('lieu').value),
      criteresTextes: crit.map(w),
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

  async function copier(partie) {
    var t = texteFinal(partie);
    try { await navigator.clipboard.writeText(t); }
    catch (e) {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    $('copie-ok').textContent = '✓ Copié';
    setTimeout(function () { $('copie-ok').textContent = ''; }, 2000);
  }

  // ---------- Événements ----------
  var drop = $('drop');
  drop.addEventListener('click', function () { $('fichier').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fichier').click(); } });
  $('fichier').addEventListener('change', function () { traiterFichier(this.files[0]); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { traiterFichier(e.dataTransfer.files[0]); });
  // Dépôt n'importe où sur la page
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) { e.preventDefault(); if (e.target !== drop) traiterFichier(e.dataTransfer.files[0]); });

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
    dlg.showModal();
  });
  $('r-fermer').addEventListener('click', function () {
    reglages.suiviPar = $('r-suivi').value;
    reglages.ville = $('r-ville').value.trim() || 'Lille';
    reglages.signature = $('r-signature').value.replace(/\s+$/, '') || DEFAUT.signature;
    sauver(); dlg.close(); maj();
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
    sauver(); remplirAgences(); maj();
  });
  $('liste-agences').addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.suppr != null && reglages.agences.length > 1 && confirm('Supprimer cette agence ?')) {
      reglages.agences.splice(+t.dataset.suppr, 1);
      sauver(); remplirAgences(); maj();
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
