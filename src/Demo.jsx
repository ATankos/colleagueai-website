/**
 * Demo.jsx — /demo is a simple "coming soon" page.
 *
 * The previous content was an "AI Flight Advisor" travel-booking demo. It did not
 * represent the governed enterprise product and has been removed. Every
 * "Book a demo" CTA on the site points here, so the route must keep working:
 * this page says plainly that the demo is not published yet and routes the
 * visitor to contact us.
 */
const C = { cream:'#F5F0E8', paper:'#FBF8F2', graphite:'#2B2A28', terra:'#C65D3A', line:'#E2D9CB', soft:'#4A4641', muted:'#8A857C' };
const serif = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

const L = {
  en: { k:'Demo', h:'Coming soon.', p:'The online demo is not published yet. In the meantime, contact us and we will walk you through a governed agent on a workflow you choose.', c:'Contact us', b:'Browse the catalogue', contact:'/contact', agents:'/agents' },
  cs: { k:'Demo', h:'Již brzy.', p:'Online demo zatím není zveřejněné. Zatím nás kontaktujte a provedeme vás řízeným agentem na procesu, který si vyberete.', c:'Kontaktujte nás', b:'Prohlédnout katalog', contact:'/cs/kontakt', agents:'/cs/agenti' },
  de: { k:'Demo', h:'Demnächst verfügbar.', p:'Die Online-Demo ist noch nicht veröffentlicht. Kontaktieren Sie uns in der Zwischenzeit, und wir führen Sie anhand eines Workflows Ihrer Wahl durch einen gesteuerten Agenten.', c:'Kontakt aufnehmen', b:'Katalog ansehen', contact:'/de/kontakt', agents:'/de/agenten' },
  fr: { k:'Démo', h:'Bientôt disponible.', p:"La démo en ligne n'est pas encore publiée. Contactez-nous en attendant et nous vous guiderons à travers un agent gouverné sur un workflow de votre choix.", c:'Nous contacter', b:'Parcourir le catalogue', contact:'/fr/contact', agents:'/fr/agents' },
  es: { k:'Demo', h:'Muy pronto.', p:'La demo en línea aún no está publicada. Mientras tanto, contáctenos y le mostraremos un agente gobernado en el flujo de trabajo que elija.', c:'Contáctenos', b:'Ver el catálogo', contact:'/es/contacto', agents:'/es/agentes' },
  it: { k:'Demo', h:'Presto disponibile.', p:'La demo online non è ancora pubblicata. Nel frattempo contattateci e vi guideremo attraverso un agente governato su un workflow a vostra scelta.', c:'Contattaci', b:'Sfoglia il catalogo', contact:'/it/contatti', agents:'/it/agenti' },
  pl: { k:'Demo', h:'Wkrótce.', p:'Demo online nie zostało jeszcze opublikowane. W międzyczasie skontaktuj się z nami, a przeprowadzimy Cię przez nadzorowanego agenta na wybranym przez Ciebie procesie.', c:'Skontaktuj się', b:'Przeglądaj katalog', contact:'/pl/kontakt', agents:'/pl/agenci' },
  pt: { k:'Demo', h:'Em breve.', p:'A demonstração online ainda não foi publicada. Entretanto, contacte-nos e mostramos-lhe um agente governado num fluxo de trabalho à sua escolha.', c:'Contacte-nos', b:'Ver o catálogo', contact:'/pt/contacto', agents:'/pt/agentes' },
};
function copy() {
  const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/(cs|de|fr|es|it|pl|pt)(\/|$)/);
  return L[m ? m[1] : 'en'] || L.en;
}

export default function Demo() {
  const t = copy();
  return (
    <div style={{ background: C.cream, color: C.graphite, fontFamily: sans, minHeight: '100vh', lineHeight: 1.6 }}>
      <style>{`
        *{box-sizing:border-box} body{margin:0}
        .d-wrap{max-width:720px;margin:0 auto;padding:0 22px}
                        .d-logo{font-family:${serif};font-size:22px;font-weight:600;color:${C.cream};text-decoration:none}
                                .d-main{text-align:center;padding:110px 22px 120px}
        .d-kicker{font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};display:block;margin-bottom:16px}
        h1{font-family:${serif};font-weight:500;font-size:clamp(30px,6vw,46px);line-height:1.15;letter-spacing:-.02em;margin:0 0 16px}
        .d-sub{font-size:17px;color:${C.soft};max-width:520px;margin:0 auto 32px}
        .d-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        .d-btn{display:inline-block;padding:13px 26px;border-radius:100px;font-weight:600;font-size:15px;text-decoration:none;border:1px solid transparent}
        .d-p{background:${C.terra};color:#fff}
        .d-p:hover{background:#A94A2C}
        .d-s{border-color:${C.graphite};color:${C.graphite}}
        .d-s:hover{background:${C.graphite};color:${C.cream}}
        a:focus-visible{outline:2px solid ${C.terra};outline-offset:2px}
        @media(max-width:560px){.d-btn{width:100%;text-align:center}}
        @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
      `}</style>


      <main className="d-wrap d-main">
        <span className="d-kicker">{t.k}</span>
        <h1>{t.h}</h1>
        <p className="d-sub">{t.p}</p>
        <div className="d-btns">
          <a className="d-btn d-p" href={t.contact}>{t.c}</a>
          <a className="d-btn d-s" href={t.agents}>{t.b}</a>
        </div>
      </main>
    </div>
  );
}
