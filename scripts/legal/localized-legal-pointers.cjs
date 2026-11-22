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
const KEY = { terms: 'terms', license: 'licence', privacy: 'privacy', refund: 'refund' }; // config/legal.json document keys
const T = {
  cs: { version: 'Platná verze: {v}. Dříve přijaté verze zůstávají archivovány a dostupné; znění, které jste přijali při objednávce, je uvedeno ve vaší objednávce.', terms: 'Podmínky služby', license: 'Licence k softwaru a agentům', privacy: 'Zásady ochrany osobních údajů', refund: 'Zásady vracení peněz', lead: 'Závazné znění tohoto dokumentu je anglické', link: 'anglické znění', later: 'Český překlad zveřejníme po jeho kontrole. Do té doby platí anglické znění.' },
  de: { version: 'Gültige Fassung: {v}. Früher akzeptierte Fassungen bleiben archiviert und abrufbar; die bei Ihrer Bestellung akzeptierte Fassung ist in Ihrer Bestellung vermerkt.', terms: 'Nutzungsbedingungen', license: 'Software- und Agentenlizenz', privacy: 'Datenschutzerklärung', refund: 'Erstattungsrichtlinie', lead: 'Verbindlich ist die englische Fassung dieses Dokuments', link: 'englische Fassung', later: 'Die deutsche Übersetzung veröffentlichen wir nach ihrer Prüfung. Bis dahin gilt die englische Fassung.' },
  fr: { version: 'Version en vigueur : {v}. Les versions acceptées auparavant restent archivées et consultables ; la version acceptée lors de votre commande figure dans votre commande.', terms: 'Conditions de service', license: 'Licence logicielle et d’agents', privacy: 'Politique de confidentialité', refund: 'Politique de remboursement', lead: 'La version faisant foi de ce document est la version anglaise', link: 'version anglaise', later: 'La traduction française sera publiée après vérification. D’ici là, la version anglaise s’applique.' },
  es: { version: 'Versión vigente: {v}. Las versiones aceptadas anteriormente siguen archivadas y disponibles; la versión que aceptó al hacer su pedido consta en su pedido.', terms: 'Condiciones del servicio', license: 'Licencia de software y agentes', privacy: 'Política de privacidad', refund: 'Política de reembolsos', lead: 'La versión vinculante de este documento es la inglesa', link: 'versión inglesa', later: 'Publicaremos la traducción al español tras su revisión. Hasta entonces se aplica la versión inglesa.' },
  it: { version: 'Versione in vigore: {v}. Le versioni accettate in precedenza restano archiviate e consultabili; la versione accettata con l’ordine è indicata nel suo ordine.', terms: 'Condizioni del servizio', license: 'Licenza software e agenti', privacy: 'Informativa sulla privacy', refund: 'Politica di rimborso', lead: 'La versione vincolante di questo documento è quella inglese', link: 'versione inglese', later: 'Pubblicheremo la traduzione italiana dopo la revisione. Fino ad allora vale la versione inglese.' },
  pl: { version: 'Obowiązująca wersja: {v}. Wcześniej zaakceptowane wersje pozostają w archiwum i są dostępne; wersja zaakceptowana przy zamówieniu jest zapisana w zamówieniu.', terms: 'Warunki korzystania z usług', license: 'Licencja na oprogramowanie i agentów', privacy: 'Polityka prywatności', refund: 'Zasady zwrotów', lead: 'Wiążąca jest angielska wersja tego dokumentu', link: 'wersja angielska', later: 'Polskie tłumaczenie opublikujemy po jego weryfikacji. Do tego czasu obowiązuje wersja angielska.' },
  pt: { version: 'Versão em vigor: {v}. As versões aceites anteriormente continuam arquivadas e disponíveis; a versão aceite na sua encomenda consta da sua encomenda.', terms: 'Termos de serviço', license: 'Licença de software e agentes', privacy: 'Política de privacidade', refund: 'Política de reembolso', lead: 'A versão vinculativa deste documento é a inglesa', link: 'versão inglesa', later: 'Publicaremos a tradução portuguesa após a revisão. Até lá, aplica-se a versão inglesa.' },
};

function pointer(l, doc) {
  const t = T[l];
  const version = legal.documents[KEY[doc]]?.version || '';
  return `\n<p class="note" data-legal-pointer="${doc}">${t.lead}: <a href="${DOCS[doc]}" hreflang="en">${t[doc]} (${t.link})</a>.</p>\n<p>${t.later}</p>\n<p>${t.version.replace('{v}', version)}</p>\n`;
}

let changed = 0;
if (status === 'out_of_sync') {
  for (const root of ['public', 'dist']) {
    if (!fs.existsSync(root)) continue;
    for (const l of legal.translations.locales || []) {
      if (!T[l]) throw new Error(`localized-legal-pointers: no strings for locale ${l}`);
      for (const doc of Object.keys(DOCS)) {
        for (const file of [path.join(root, l, `${doc}.html`), path.join(root, l, doc, 'index.html')]) {
          let html;
          try { html = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
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
