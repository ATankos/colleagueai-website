#!/usr/bin/env node
/**
 * scripts/legal/localized-legal-pointers.cjs - last build step. While config/legal.json translations.status is
 * "out_of_sync", the localized pages of the four accepted agreements (Terms, Licence, Privacy, Refund) carry no
 * agreement text of their own: they say, in their language, that the binding text is the English version and link to
 * it. A machine-mixed or outdated translation of an agreement is never shown as if it were the agreement. Once the
 * translations are redone from the approved English text and the status is set to "in_sync", this step does nothing.
 *
 * Runs over public/ and dist/ (public/ is both source and build output in this repository).
 */
const fs = require('fs');
const path = require('path');

const legal = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/legal.json'), 'utf8'));
const status = legal.translations?.status;
const DOCS = { terms: '/terms', license: '/license', privacy: '/privacy', refund: '/refund' };
const T = {
  cs: { terms: 'Podmínky služby', license: 'Licence k softwaru a agentům', privacy: 'Zásady ochrany osobních údajů', refund: 'Zásady vracení peněz', lead: 'Závazné znění tohoto dokumentu je anglické', link: 'anglické znění', later: 'Český překlad zveřejníme po jeho kontrole. Do té doby platí anglické znění.' },
  de: { terms: 'Nutzungsbedingungen', license: 'Software- und Agentenlizenz', privacy: 'Datenschutzerklärung', refund: 'Erstattungsrichtlinie', lead: 'Verbindlich ist die englische Fassung dieses Dokuments', link: 'englische Fassung', later: 'Die deutsche Übersetzung veröffentlichen wir nach ihrer Prüfung. Bis dahin gilt die englische Fassung.' },
  fr: { terms: 'Conditions de service', license: 'Licence logicielle et d’agents', privacy: 'Politique de confidentialité', refund: 'Politique de remboursement', lead: 'La version faisant foi de ce document est la version anglaise', link: 'version anglaise', later: 'La traduction française sera publiée après vérification. D’ici là, la version anglaise s’applique.' },
  es: { terms: 'Condiciones del servicio', license: 'Licencia de software y agentes', privacy: 'Política de privacidad', refund: 'Política de reembolsos', lead: 'La versión vinculante de este documento es la inglesa', link: 'versión inglesa', later: 'Publicaremos la traducción al español tras su revisión. Hasta entonces se aplica la versión inglesa.' },
  it: { terms: 'Condizioni del servizio', license: 'Licenza software e agenti', privacy: 'Informativa sulla privacy', refund: 'Politica di rimborso', lead: 'La versione vincolante di questo documento è quella inglese', link: 'versione inglese', later: 'Pubblicheremo la traduzione italiana dopo la revisione. Fino ad allora vale la versione inglese.' },
  pl: { terms: 'Warunki korzystania z usług', license: 'Licencja na oprogramowanie i agentów', privacy: 'Polityka prywatności', refund: 'Zasady zwrotów', lead: 'Wiążąca jest angielska wersja tego dokumentu', link: 'wersja angielska', later: 'Polskie tłumaczenie opublikujemy po jego weryfikacji. Do tego czasu obowiązuje wersja angielska.' },
  pt: { terms: 'Termos de serviço', license: 'Licença de software e agentes', privacy: 'Política de privacidade', refund: 'Política de reembolso', lead: 'A versão vinculativa deste documento é a inglesa', link: 'versão inglesa', later: 'Publicaremos a tradução portuguesa após a revisão. Até lá, aplica-se a versão inglesa.' },
};

function pointer(l, doc) {
  const t = T[l];
  return `\n<p class="note" data-legal-pointer="${doc}">${t.lead}: <a href="${DOCS[doc]}" hreflang="en">${t[doc]} (${t.link})</a>.</p>\n<p>${t.later}</p>\n`;
}

let changed = 0;
if (status === 'out_of_sync') {
  for (const root of ['public', 'dist']) {
    if (!fs.existsSync(root)) continue;
    for (const l of legal.translations.locales || []) {
      if (!T[l]) throw new Error(`localized-legal-pointers: no strings for locale ${l}`);
      for (const doc of Object.keys(DOCS)) {
        for (const file of [path.join(root, l, `${doc}.html`), path.join(root, l, doc, 'index.html')]) {
          if (!fs.existsSync(file)) continue;
          const html = fs.readFileSync(file, 'utf8');
          const i = html.indexOf('</h1>');
          const j = html.indexOf('</main>');
          if (i < 0 || j < i) continue;
          const next = html.slice(0, i + 5) + pointer(l, doc) + html.slice(j);
          if (next !== html) { fs.writeFileSync(file, next); changed += 1; }
        }
      }
    }
  }
}
console.log(`localized-legal-pointers: translations ${status}; ${changed} page(s) point to the English text`);
