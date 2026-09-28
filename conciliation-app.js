/* Onglet « Conciliations » : convocation déposée -> pouvoir au format Word. */
(function () {
  'use strict';
  var C = window.Conciliation;
  var $ = function (id) { return document.getElementById(id); };
  var reglages = C.DEFAUT;
  var nomFichierSource = '';

  function echapper(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  reglages.mandataires.forEach(function (m, i) {
    var o = document.createElement('option');
    o.value = i; o.textContent = m.nom;
    $('c-mandataire').appendChild(o);
  });
  $('c-date').value = C.dateCourte(new Date());

  // ---------- Données saisies ----------
  var S = '\u0001', E = '\u0002';
  function donnees(marquer) {
    var w = function (v) { v = v.trim(); return marquer && v ? S + v + E : v; };
    return {
      demandeur: w($('c-demandeur').value), jour: w($('c-jour').value), heure: w($('c-heure').value),
      lieu: w($('c-lieu').value.replace(/\s*\n\s*/g, ' ')), mandataire: $('c-mandataire').value,
      datePouvoir: $('c-date').value.trim(), reglages: reglages
    };
  }

  function maj() {
    var html = '<img class="logo-doc" src="modeles/logo-partenord-habitat.png" alt="Partenord Habitat">';
    C.pouvoir(donnees(true)).forEach(function (p) {
      var t = echapper(p.texte).replace(/\u0001([^\u0002]*)\u0002/g, '<span class="var">$1</span>')
        .replace(/\[(DEMANDEUR|DATE|HEURE|LIEU|MANDATAIRE|ADRESSE)\]/g, '<span class="trou">[$1]</span>');
      if (p.style === 'entete') html += '<div class="entete">' + t + '</div>';
      else if (p.style === 'titre') html += '<h3>' + t + '</h3>';
      else if (p.style === 'signature') html += '<div class="signature">' + t + '</div>';
      else html += '<p>' + t + '</p>';
    });
    $('c-apercu').innerHTML = html;
    ['c-demandeur', 'c-jour', 'c-heure', 'c-lieu'].forEach(function (id) { $(id).classList.toggle('manquant', !$(id).value.trim()); });
  }

  function analyser(texte) {
    var r = C.extraire(texte);
    $('c-demandeur').value = r.demandeur;
    $('c-jour').value = r.jour;
    $('c-heure').value = r.heure;
    $('c-lieu').value = r.lieu;
    var i = C.mandataireConnu(r.mandataire, reglages.mandataires);
    if (i >= 0) $('c-mandataire').value = i;
    maj();
  }

  async function traiter(f) {
    if (!f) return;
    nomFichierSource = f.name;
    try {
      $('c-etat').textContent = 'Ouverture de « ' + f.name + ' »…';
      var texte = await window.Lecture.lireFichier(f);
      $('c-texte').value = texte;
      analyser(texte);
      $('c-etat').innerHTML = '<span style="color:var(--ok)">✓ « ' + echapper(f.name) + ' » lu. Vérifiez les champs surlignés.</span>';
    } catch (e) {
      console.error(e);
      $('c-etat').innerHTML = '<span style="color:var(--warn)">Impossible de lire ce fichier (' + echapper(e.message || e) + '). Vous pouvez coller le texte ci-dessous.</span>';
    }
  }

  // ---------- Word ----------
  var logo = null;
  async function chargerLogo() {
    if (logo) return logo;
    try {
      var rep = await fetch('modeles/logo-partenord-habitat.png');
      var png = new Uint8Array(await rep.arrayBuffer());
      // dimensions lues dans l'en-tête PNG
      var vue = new DataView(png.buffer);
      logo = { png: png, largeur: vue.getUint32(16), hauteur: vue.getUint32(20), largeurCm: 3.4 };
    } catch (e) { logo = null; }
    return logo;
  }

  async function telecharger() {
    var d = donnees(false);
    var octets = C.docx(d, await chargerLogo());
    // nom de famille = mots en capitales (« ITELA AUGUSTO »), sinon le dernier mot
    var mots = d.demandeur.split(/\s+/).slice(1);
    var nom = (mots.filter(function (w) { return w.length > 1 && w === w.toUpperCase(); }).join(' ') || mots.pop() || 'conciliation').replace(/[^\wÀ-ÿ' -]/g, '');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    a.download = 'Pouvoir conciliation - ' + nom + '.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    ok('✓ Fichier Word téléchargé');
  }

  async function copier() {
    var t = C.pouvoirTexte(donnees(false));
    try { await navigator.clipboard.writeText(t); }
    catch (e) {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    ok('✓ Copié');
  }

  function ok(msg) {
    $('c-ok').textContent = msg;
    setTimeout(function () { $('c-ok').textContent = ''; }, 2500);
  }

  // ---------- Événements ----------
  var drop = $('c-drop');
  drop.addEventListener('click', function () { $('c-fichier').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('c-fichier').click(); } });
  $('c-fichier').addEventListener('change', function () { traiter(this.files[0]); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  // Dépôt n'importe où dans l'onglet
  document.addEventListener('drop', function (e) {
    if (!$('vue-conciliation').hidden && e.dataTransfer && e.dataTransfer.files.length) traiter(e.dataTransfer.files[0]);
  });
  $('c-analyser').addEventListener('click', function () { analyser($('c-texte').value); });
  $('vue-conciliation').addEventListener('input', maj);
  $('vue-conciliation').addEventListener('change', maj);
  $('c-word').addEventListener('click', telecharger);
  $('c-copier').addEventListener('click', copier);

  maj();
})();
