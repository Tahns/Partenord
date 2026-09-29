/* Code d'accès demandé à chaque ouverture de la page.
   Simple barrière contre les visiteurs de passage : le site ne contient aucune donnée
   (les courriers restent sur le poste), ce n'est pas une protection forte.
   Seule l'empreinte SHA-256 du code figure ici, jamais le code lui-même. */
(function () {
  'use strict';
  var EMPREINTE = 'eef10cd7c4781ec0ed30fe65312132b047f52e51312c32236822546d0fd3ba2d';
  var SEL = 'partenord-courriers:';
  var $ = function (id) { return document.getElementById(id); };

  async function empreinte(code) {
    var octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SEL + code));
    return Array.prototype.map.call(new Uint8Array(octets), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // Le code est saisi dans un champ texte masqué, pour que le navigateur ne propose pas
  // de l'enregistrer ; sans masquage possible, on revient à un champ mot de passe.
  if (!(window.CSS && CSS.supports('-webkit-text-security', 'disc'))) $('verrou-code').type = 'password';

  var essais = 0;
  $('verrou-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var champ = $('verrou-code'), bouton = this.querySelector('button');
    bouton.disabled = true;
    if (await empreinte(champ.value.trim()) === EMPREINTE) {
      champ.value = '';
      document.body.classList.remove('verrouille');
      $('verrou').remove();
      return;
    }
    essais++;
    $('verrou-message').textContent = 'Code incorrect.';
    champ.value = '';
    // petite attente, qui s'allonge à chaque erreur
    setTimeout(function () { bouton.disabled = false; champ.focus(); }, Math.min(500 * essais, 5000));
  });
  $('verrou-code').focus();
})();
