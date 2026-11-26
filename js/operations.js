'use strict';

(function() {
  function esc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  window.SonaOperationsModule = {
    mount: function(session, mod) {
      const container = document.getElementById('osMainContent');
      if (!container) return;

      const schwundUrl = (mod && mod.schwundUrl) || '';
      const bruchUrl = (mod && mod.bruchUrl) || '';

      container.innerHTML =
        '<div class="card">' +
          '<div class="card-head">' +
            '<div>' +
              '<div class="kicker">Oberebene 3 · Operations · ' + esc(session.standortName) + ' (' + esc(session.standortId) + ')</div>' +
              '<h3>Operativer Tagesbetrieb</h3>' +
            '</div>' +
            '<span class="badge badge-ok">Vernetzt mit Warenwirtschaft</span>' +
          '</div>' +
          '<p class="module-desc">Diese Oberebene bündelt alle operativen Tagesprozesse im Betrieb. Schwund- und Bruchbuchungen sind bereits live mit deinen Google Sheets und der Ebene Bestand &amp; Warenverbrauch synchronisiert. Weitere operative Bausteine (Reklamationen, Mitarbeiter-Bewertungen, Schicht-Checklisten) docken hier nahtlos mit demselben PIN-Zugang und Standort-Kontext an.</p>' +
        '</div>' +
        '<div class="pillar-section">' +
          '<div class="pillar-head"><div class="kicker">Aktiv &amp; synchronisiert</div><h3>Operative Erfassung (Schwund &amp; Bruch)</h3></div>' +
          '<div class="grid-2">' +
            '<div class="module-card">' +
              '<div>' +
                '<div class="kicker">Ebene 4 · Sonderfälle</div>' +
                '<h3>Schwund-Erfassung</h3>' +
                '<p class="module-desc">Tagesaktuelle Erfassung von Verderb, Überproduktion &amp; Küchen-/Bar-Schwund. Fließt automatisch in Bestand &amp; Warenverbrauch ein.</p>' +
              '</div>' +
              '<div>' +
                '<div style="margin-bottom:10px;"><span class="badge badge-ok">Live &amp; synchron</span></div>' +
                (schwundUrl ? '<a class="btn btn-primary btn-sm" href="' + esc(schwundUrl) + '" target="_blank" rel="noopener">Schwund erfassen ↗</a>' : '') +
              '</div>' +
            '</div>' +
            '<div class="module-card">' +
              '<div>' +
                '<div class="kicker">Ebene 4 · Sonderfälle</div>' +
                '<h3>Bruch-Erfassung</h3>' +
                '<p class="module-desc">Schnelle Erfassung von Glas-, Geschirr- und Flaschenbruch im laufenden Service. Direkt synchronisiert mit dem Standort-Sheet.</p>' +
              '</div>' +
              '<div>' +
                '<div style="margin-bottom:10px;"><span class="badge badge-ok">Live &amp; synchron</span></div>' +
                (bruchUrl ? '<a class="btn btn-primary btn-sm" href="' + esc(bruchUrl) + '" target="_blank" rel="noopener">Bruch erfassen ↗</a>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pillar-section">' +
          '<div class="pillar-head"><div class="kicker">Struktur vorbereitet</div><h3>Geplante Operations-Bausteine</h3></div>' +
          '<div class="grid-3">' +
            '<div class="module-card">' +
              '<div><div class="kicker">Operations · Ausbau</div><h3>Gäste-Reklamationen</h3><p class="module-desc">Strukturierte Erfassung von Reklamationen, Ursachen, Kulanz &amp; Auswertung pro Standort.</p></div>' +
              '<div><span class="badge badge-info">Architektur vorbereitet</span></div>' +
            '</div>' +
            '<div class="module-card">' +
              '<div><div class="kicker">Operations · Ausbau</div><h3>Mitarbeiter-Bewertungen</h3><p class="module-desc">Regelmäßige Feedback- &amp; Entwicklungsbögen mit geschütztem Rollenzugriff für Management &amp; Admin.</p></div>' +
              '<div><span class="badge badge-info">Architektur vorbereitet</span></div>' +
            '</div>' +
            '<div class="module-card">' +
              '<div><div class="kicker">Operations · Ausbau</div><h3>Schicht-Checklisten &amp; Übergabe</h3><p class="module-desc">Öffnungs-/Schließroutinen, Hygiene-Checks und digitales Schicht-Übergabeprotokoll.</p></div>' +
              '<div><span class="badge badge-info">Architektur vorbereitet</span></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
  };
})();
