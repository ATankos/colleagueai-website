/**
 * Demo.jsx – /demo is the booking form for demos.
 * Collects: email, company, role, agents of interest (by pillar), preferred date, timezone
 * Submits to: /api/demo-booking
 */
import { useEffect, useState } from 'react';
import PRICING from '../config/pricing.json';
import PRODUCTS from '../config/products.json';

const C = { cream:'#F5F0E8', paper:'#FBF8F2', graphite:'#2B2A28', terra:'#C65D3A', line:'#E2D9CB', soft:'#4A4641', muted:'#8A857C' };
const serif = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Pillar labels match the live catalogue taxonomy (public/*/agents.html chip
// filters: data-pillar="ops|risk|data|sales|corp") so "agents of interest"
// options are real site categories, not invented product names.
const L = {
  en: {
    title: 'Book a demo', subtitle: 'A 30-minute guided evaluation of Contract Intelligence & Register on sample contracts in a test tenant, with the review step and the register on screen. We also walk through the catalogue factsheets for your use case and answer your pricing questions.',
    formTitle: 'Your Information', email: 'Email *', company: 'Company *', role: 'Your Role *',
    agentsTitle: 'Areas of Interest', schedule: 'Schedule', date: 'Preferred Date *', timezone: 'Time Zone *',
    submit: 'Request Demo', submitting: 'Submitting…',
    success: 'Thanks, we have your request. We reply within one business day with a time.',
    error: 'Failed to submit demo request. Please try again.',
    pillars: { ops: 'Operations & Service', risk: 'Risk, Security & Compliance', data: 'Data & Infrastructure', sales: 'Sales & Marketing', corp: 'Corporate' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'You are requesting',
    indicative: 'Package price', oneTime: 'one-time',
    concept: 'Concept · dossier only', tierPrice: 'tier price once released',
    privacy: 'We use these details only to arrange your demo. Colleague AI s.r.o., Praha. See our',
    privacyLink: 'Privacy Policy',
    privacyHref: '/privacy',
    contact:'/contact', agents:'/agents', title2:'Book a Demo | Colleague AI', desc:'Book a 30-minute guided evaluation of Contract Intelligence & Register on sample contracts in a test tenant, with the review step and the register on screen.',
  },
  cs: {
    title: 'Domluvit demo', subtitle: '30minutové vedené vyhodnocení Contract Intelligence & Register na vzorových smlouvách v testovacím tenantu, s kontrolním krokem a registrem na obrazovce. Projdeme s vámi i produktové listy z katalogu pro váš případ použití a zodpovíme otázky k ceně.',
    formTitle: 'Vaše údaje', email: 'E-mail *', company: 'Společnost *', role: 'Vaše pozice *',
    agentsTitle: 'Oblasti zájmu', schedule: 'Plán', date: 'Preferované datum *', timezone: 'Časové pásmo *',
    submit: 'Požádat o demo', submitting: 'Odesílání…',
    success: 'Děkujeme, žádost máme. Odpovíme do jednoho pracovního dne s návrhem termínu.',
    error: 'Nepodařilo se odeslat žádost o demo. Zkuste to prosím znovu.',
    pillars: { ops: 'Provoz a služby', risk: 'Riziko, bezpečnost a compliance', data: 'Data a infrastruktura', sales: 'Obchod a marketing', corp: 'Korporátní' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Požadujete',
    indicative: 'Cena balíčku', oneTime: 'jednorázově',
    concept: 'Koncept · pouze dokumentace', tierPrice: 'cena úrovně po vydání',
    privacy: 'Tyto údaje použijeme pouze k domluvení ukázky. Colleague AI s.r.o., Praha. Viz naše',
    privacyLink: 'Zásady ochrany osobních údajů',
    privacyHref: '/cs/ochrana-soukromi',
    contact:'/cs/kontakt', agents:'/cs/agenti', title2:'Zarezervovat si demo | Colleague AI', desc:'Rezervujte si 30minutové vedené vyhodnocení Contract Intelligence & Register na vzorových smlouvách v testovacím tenantu, s kontrolním krokem a registrem na obrazovce.',
  },
  de: {
    title: 'Demo buchen', subtitle: 'Eine 30-minütige begleitete Bewertung von Contract Intelligence & Register an Beispielverträgen in einem Test-Tenant, mit Prüfschritt und Register auf dem Bildschirm. Wir gehen außerdem die Katalog-Factsheets für Ihren Anwendungsfall durch und beantworten Ihre Preisfragen.',
    formTitle: 'Ihre Informationen', email: 'E-Mail *', company: 'Unternehmen *', role: 'Ihre Rolle *',
    agentsTitle: 'Interessensbereiche', schedule: 'Zeitplan', date: 'Bevorzugtes Datum *', timezone: 'Zeitzone *',
    submit: 'Demo anfordern', submitting: 'Wird gesendet…',
    success: 'Danke, Ihre Anfrage ist da. Wir antworten innerhalb eines Werktags mit einem Terminvorschlag.',
    error: 'Fehler beim Senden der Demo-Anfrage. Bitte versuchen Sie es erneut.',
    pillars: { ops: 'Betrieb & Service', risk: 'Risiko, Sicherheit & Compliance', data: 'Daten & Infrastruktur', sales: 'Vertrieb & Marketing', corp: 'Unternehmen' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Sie fragen an',
    indicative: 'Paketpreis', oneTime: 'einmalig',
    concept: 'Konzept · nur Dossier', tierPrice: 'Stufenpreis nach Freigabe',
    privacy: 'Wir verwenden diese Angaben ausschließlich zur Vereinbarung Ihrer Demo. Colleague AI s.r.o., Prag. Siehe unsere',
    privacyLink: 'Datenschutzerklärung',
    privacyHref: '/de/datenschutz',
    contact:'/de/kontakt', agents:'/de/agenten', title2:'Demo buchen | Colleague AI', desc:'Buchen Sie eine 30-minütige begleitete Bewertung von Contract Intelligence & Register an Beispielverträgen in einem Test-Tenant, mit Prüfschritt und Register auf dem Bildschirm.',
  },
  fr: {
    title: 'Réserver une démo', subtitle: 'Une évaluation guidée de 30 minutes de Contract Intelligence & Register sur des contrats d’exemple dans un tenant de test, avec l’étape de vérification et le registre à l’écran. Nous parcourons aussi les fiches produit du catalogue pour votre cas d’usage et répondons à vos questions sur les tarifs.',
    formTitle: 'Vos informations', email: 'E-mail *', company: 'Entreprise *', role: 'Votre rôle *',
    agentsTitle: 'Domaines d’intérêt', schedule: 'Calendrier', date: 'Date préférée *', timezone: 'Fuseau horaire *',
    submit: 'Demander une démo', submitting: 'Envoi en cours…',
    success: 'Merci, votre demande est bien reçue. Nous répondons sous un jour ouvré avec une proposition de créneau.',
    error: 'Erreur lors de l’envoi de la demande de démo. Veuillez réessayer.',
    pillars: { ops: 'Opérations & service', risk: 'Risque, sécurité & conformité', data: 'Données & infrastructure', sales: 'Ventes & marketing', corp: 'Fonctions support' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Vous demandez',
    indicative: 'Prix du package', oneTime: 'paiement unique',
    concept: 'Concept · dossier uniquement', tierPrice: 'prix du niveau une fois publié',
    privacy: 'Nous utilisons ces informations uniquement pour organiser votre démo. Colleague AI s.r.o., Prague. Voir notre',
    privacyLink: 'politique de confidentialité',
    privacyHref: '/fr/confidentialite',
    contact:'/fr/contact', agents:'/fr/agents', title2:'Réserver une démo | Colleague AI', desc:'Réservez une évaluation guidée de 30 minutes de Contract Intelligence & Register sur des contrats d’exemple dans un tenant de test, avec l’étape de vérification et le registre à l’écran.',
  },
  es: {
    title: 'Reservar una demo', subtitle: 'Una evaluación guiada de 30 minutos de Contract Intelligence & Register con contratos de ejemplo en un tenant de prueba, con el paso de revisión y el registro en pantalla. También repasamos las fichas del catálogo para su caso de uso y respondemos a sus preguntas sobre precios.',
    formTitle: 'Su información', email: 'Correo electrónico *', company: 'Empresa *', role: 'Su rol *',
    agentsTitle: 'Áreas de interés', schedule: 'Horario', date: 'Fecha preferida *', timezone: 'Zona horaria *',
    submit: 'Solicitar demostración', submitting: 'Enviando…',
    success: 'Gracias, hemos recibido su solicitud. Respondemos en un día laborable con una propuesta de horario.',
    error: 'Error al enviar la solicitud de demostración. Inténtelo de nuevo.',
    pillars: { ops: 'Operaciones y servicio', risk: 'Riesgo, seguridad y cumplimiento', data: 'Datos e infraestructura', sales: 'Ventas y marketing', corp: 'Corporativo' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Está solicitando',
    indicative: 'Precio del paquete', oneTime: 'pago único',
    concept: 'Concepto · solo dossier', tierPrice: 'precio del nivel una vez publicado',
    privacy: 'Usamos estos datos únicamente para concertar su demostración. Colleague AI s.r.o., Praga. Consulte nuestra',
    privacyLink: 'Política de privacidad',
    privacyHref: '/es/privacidad',
    contact:'/es/contacto', agents:'/es/agentes', title2:'Reservar una demo | Colleague AI', desc:'Reserve una evaluación guiada de 30 minutos de Contract Intelligence & Register con contratos de ejemplo en un tenant de prueba, con el paso de revisión y el registro en pantalla.',
  },
  it: {
    title: 'Prenota una demo', subtitle: 'Una valutazione guidata di 30 minuti di Contract Intelligence & Register su contratti di esempio in un tenant di test, con il passaggio di revisione e il registro sullo schermo. Esaminiamo anche le schede prodotto del catalogo per il vostro caso d’uso e rispondiamo alle domande sui prezzi.',
    formTitle: 'Le tue informazioni', email: 'E-mail *', company: 'Azienda *', role: 'Il tuo ruolo *',
    agentsTitle: 'Aree di interesse', schedule: 'Programma', date: 'Data preferita *', timezone: 'Fuso orario *',
    submit: 'Richiedi demo', submitting: 'Invio in corso…',
    success: 'Grazie, abbiamo ricevuto la richiesta. Rispondiamo entro un giorno lavorativo con una proposta di orario.',
    error: 'Errore nell’invio della richiesta di demo. Riprova.',
    pillars: { ops: 'Operations e servizio', risk: 'Rischio, sicurezza e compliance', data: 'Dati e infrastruttura', sales: 'Vendite e marketing', corp: 'Corporate' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Stai richiedendo',
    indicative: 'Prezzo del pacchetto', oneTime: 'una tantum',
    concept: 'Concept · solo dossier', tierPrice: 'prezzo del livello una volta rilasciato',
    privacy: 'Utilizziamo questi dati solo per organizzare la tua demo. Colleague AI s.r.o., Praga. Consulta la nostra',
    privacyLink: 'Informativa sulla privacy',
    privacyHref: '/it/privacy',
    contact:'/it/contatti', agents:'/it/agenti', title2:'Prenota una demo | Colleague AI', desc:'Prenota una valutazione guidata di 30 minuti di Contract Intelligence & Register su contratti di esempio in un tenant di test, con il passaggio di revisione e il registro sullo schermo.',
  },
  pl: {
    title: 'Umów demo', subtitle: '30-minutowa ocena z przewodnikiem Contract Intelligence & Register na przykładowych umowach w testowym tenancie, z krokiem weryfikacji i rejestrem na ekranie. Omówimy też karty produktów z katalogu dla Twojego przypadku użycia i odpowiemy na pytania o ceny.',
    formTitle: 'Twoje informacje', email: 'E-mail *', company: 'Firma *', role: 'Twoja rola *',
    agentsTitle: 'Obszary zainteresowania', schedule: 'Harmonogram', date: 'Preferowana data *', timezone: 'Strefa czasowa *',
    submit: 'Poproś o demo', submitting: 'Wysyłanie…',
    success: 'Dziękujemy, mamy Twoje zgłoszenie. Odpowiemy w ciągu jednego dnia roboczego z propozycją terminu.',
    error: 'Błąd przy przesyłaniu prośby o demo. Spróbuj ponownie.',
    pillars: { ops: 'Operacje i usługi', risk: 'Ryzyko, bezpieczeństwo i zgodność', data: 'Dane i infrastruktura', sales: 'Sprzedaż i marketing', corp: 'Korporacyjne' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Zamawiasz',
    indicative: 'Cena pakietu', oneTime: 'jednorazowo',
    concept: 'Koncepcja · tylko dossier', tierPrice: 'cena poziomu po wydaniu',
    privacy: 'Używamy tych danych wyłącznie do umówienia demonstracji. Colleague AI s.r.o., Praga. Zobacz naszą',
    privacyLink: 'Politykę prywatności',
    privacyHref: '/pl/prywatnosc',
    contact:'/pl/kontakt', agents:'/pl/agenci', title2:'Zarezerwuj demo | Colleague AI', desc:'Umów 30-minutową ocenę z przewodnikiem Contract Intelligence & Register na przykładowych umowach w testowym tenancie, z krokiem weryfikacji i rejestrem na ekranie.',
  },
  pt: {
    title: 'Marcar uma demo', subtitle: 'Uma avaliação guiada de 30 minutos do Contract Intelligence & Register com contratos de exemplo num tenant de teste, com o passo de revisão e o registo no ecrã. Também percorremos as fichas do catálogo para o seu caso de uso e respondemos às suas perguntas sobre preços.',
    formTitle: 'Suas informações', email: 'E-mail *', company: 'Empresa *', role: 'Seu cargo *',
    agentsTitle: 'Áreas de interesse', schedule: 'Agenda', date: 'Data preferida *', timezone: 'Fuso horário *',
    submit: 'Solicitar demo', submitting: 'Enviando…',
    success: 'Obrigado, recebemos o seu pedido. Respondemos num dia útil com uma proposta de horário.',
    error: 'Erro ao enviar a solicitação de demo. Tente novamente.',
    pillars: { ops: 'Operações e serviço', risk: 'Risco, segurança e conformidade', data: 'Dados e infraestrutura', sales: 'Vendas e marketing', corp: 'Corporativo' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    requested: 'Está a solicitar',
    indicative: 'Preço do pacote', oneTime: 'pagamento único',
    concept: 'Conceito · apenas dossier', tierPrice: 'preço do nível depois de lançado',
    privacy: 'Usamos estes dados apenas para agendar a sua demonstração. Colleague AI s.r.o., Praga. Consulte a nossa',
    privacyLink: 'Política de Privacidade',
    privacyHref: '/pt/privacidade',
    contact:'/pt/contacto', agents:'/pt/agentes', title2:'Agendar uma demo | Colleague AI', desc:'Marque uma avaliação guiada de 30 minutos do Contract Intelligence & Register com contratos de exemplo num tenant de teste, com o passo de revisão e o registo no ecrã.',
  },
};

// Local date, not UTC: a visitor in Auckland picking "today" must not be told
// their own date is in the past. The server re-checks with the same tolerance.
function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function copy() {
  const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/(cs|de|fr|es|it|pl|pt)(\/|$)/);
  return L[m ? m[1] : 'en'] || L.en;
}

/**
 * The access CTA in the catalogue sends visitors here as
 * /demo?agent=<slug>&tier=<L3>. Reading it means the enquiry names a product
 * instead of arriving blank, which is what sales previously had to guess at.
 * Values are treated as untrusted: slug is pattern-checked, tier is matched
 * against the tiers the catalogue actually ships.
 */
// Indicative one-time package price per CAI tier, in USD, read from the same
// config the checkout endpoint and the pricing guard use, so the demo form can
// never quote a number the rest of the site has moved on from. L1 is not sold and
// no L5 agent ships yet, but both are priced in the config.
const PACKAGE_PRICE_USD = Object.fromEntries(
  Object.entries(PRICING.tiers).map(([tier, v]) => [tier, v.oneTimeCents / 100]),
);

function requestedAgent() {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const slug = (q.get('agent') || '').trim();
  const tier = (q.get('tier') || '').trim().toUpperCase();
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)) return null;
  const safeTier = /^L[1-5]$/.test(tier) ? tier : '';
  return {
    slug,
    tier: safeTier,
    label: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    priceUsd: PACKAGE_PRICE_USD[safeTier] || 0,
    // only an agent with a product record has a released package; everything else is a concept with a dossier
    released: Boolean(PRODUCTS[slug]?.release),
  };
}

export default function Demo() {
  const t = copy();
  const [requested] = useState(requestedAgent);

  // CAI-008: set lang attribute + localized metadata for this locale. The
  // static shell (built by Vite into demo.html) always ships with English
  // head tags, so this corrects them client-side for hydrated visitors;
  // crawlers that don't execute JS still see the shell defaults.
  useEffect(() => {
    const m = window.location.pathname.match(/^\/(cs|de|fr|es|it|pl|pt)(\/|$)/);
    const lang = m ? m[1] : 'en';
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-cai-page', 'demo');

    const updateMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };
    const updateMetaProperty = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };
    document.title = t.title2;
    updateMeta('description', t.desc);
    updateMetaProperty('og:title', t.title2);
    updateMetaProperty('og:description', t.desc);

    const canonicalUrl = lang === 'en' ? 'https://www.colleagueai.ai/demo' : `https://www.colleagueai.ai/${lang}/demo`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;
  }, [t]);

  const [formData, setFormData] = useState({
    email: '', company: '', role: '', agentsOfInterest: [], preferredDate: '',
    timeZone: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').includes('/') ? 'UTC' : 'UTC',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const pillarOptions = Object.entries(t.pillars).map(([id, label]) => ({ id, label }));

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (pillarId) => {
    setFormData(prev => ({
      ...prev,
      agentsOfInterest: prev.agentsOfInterest.includes(pillarId)
        ? prev.agentsOfInterest.filter(id => id !== pillarId)
        : [...prev.agentsOfInterest, pillarId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/demo-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          requested ? { ...formData, agentSlug: requested.slug, agentTier: requested.tier } : formData
        ),
      });
      if (response.ok) {
        setSubmitted(true);
        setFormData({ email: '', company: '', role: '', agentsOfInterest: [], preferredDate: '', timeZone: 'UTC' });
      } else {
        setError(true);
      }
    } catch (err) {
      setError(true);
      console.error('Demo booking error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: C.cream, color: C.graphite, fontFamily: sans, minHeight: '100vh', lineHeight: 1.6 }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        .demo-container { max-width: 720px; margin: 0 auto; padding: 0 22px; }
        .demo-hero { text-align: center; padding: 60px 22px 40px; }
        .demo-kicker { font-family: ui-monospace, Consolas, monospace; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: ${C.soft}; display: block; margin-bottom: 16px; }
        h1 { font-family: ${serif}; font-weight: 500; font-size: clamp(30px, 6vw, 46px); line-height: 1.15; letter-spacing: -.02em; margin: 0 0 16px; }
        .demo-subtitle { font-size: 17px; color: ${C.soft}; max-width: 520px; margin: 0 auto 40px; }
        .demo-form { background: ${C.paper}; padding: 32px; border-radius: 12px; margin: 0 0 40px; border: 1px solid ${C.line}; }
        fieldset { border: none; padding: 0; margin: 0 0 24px; }
        legend { font-size: 14px; font-weight: 600; margin: 0 0 12px; padding: 0; }
        label { display: block; font-size: 14px; font-weight: 500; margin: 0 0 6px; }
        input, select { width: 100%; padding: 10px 12px; border: 1px solid ${C.line}; border-radius: 6px; font-family: ${sans}; font-size: 14px; margin: 0 0 12px; background: #fff; color: ${C.graphite}; }
        input:focus, select:focus { outline: 2px solid ${C.terra}; outline-offset: -2px; border-color: ${C.terra}; }
        .checkbox-group { display: flex; flex-wrap: wrap; gap: 12px; }
        .checkbox-label { display: flex; align-items: center; font-size: 14px; cursor: pointer; font-weight: 400; }
        .checkbox-label input { width: auto; margin: 0 8px 0 0; }
        .demo-submit { background: ${C.terra}; color: #fff; padding: 13px 26px; border: none; border-radius: 100px; font-weight: 600; font-size: 15px; cursor: pointer; width: 100%; }
        .demo-submit:hover { background: #A94A2C; }
        .demo-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .demo-requested { background: #fff; border: 1px solid ${C.line}; border-left: 3px solid ${C.terra}; border-radius: 8px; padding: 11px 14px; margin: 0 0 20px; font-size: 14px; }
        /* C.muted (#8A857C) reads as ~3.2:1 on this panel's cream/paper backgrounds —
           short of WCAG AA's 4.5:1 for normal text (axe: color-contrast, serious).
           C.soft is the same palette's darker secondary tone (8:1+ on both) and was
           already used elsewhere for readable-but-secondary text; reusing it here
           keeps the look but clears the ratio. C.terra (the brand accent) on these
           backgrounds and as this link's color is ALSO short (3.7-4.2:1) — left
           alone since that's the brand colour itself, not a one-component fix. */
        .demo-privacy { font-size: 12.5px; color: ${C.soft}; line-height: 1.5; margin: 14px 0 0; text-align: center; }
        .demo-privacy a { color: ${C.terra}; }
        .success-msg { background: #E8F5E9; color: #2E7D32; padding: 16px; border-radius: 8px; text-align: center; margin: 0 0 24px; }
        .error-msg { background: #FFEBEE; color: #C62828; padding: 16px; border-radius: 8px; text-align: center; margin: 0 0 24px; }
        a:focus-visible { outline: 2px solid ${C.terra}; outline-offset: 2px; }
        @media (max-width: 560px) {
          .demo-form { padding: 20px; }
          input, select { font-size: 16px; }
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <main className="demo-container">
        <div className="demo-hero">
          <span className="demo-kicker">Demo</span>
          <h1>{t.title}</h1>
          <p className="demo-subtitle">{t.subtitle}</p>
        </div>

        {submitted ? (
          <div className="success-msg" role="status" aria-live="polite">{t.success}</div>
        ) : (
          <>
            {error && <div className="error-msg" role="alert" aria-live="assertive">{t.error}</div>}

            <form onSubmit={handleSubmit} className="demo-form">
              {requested && (
                <p className="demo-requested">
                  {t.requested}: <strong>{requested.label}</strong>
                  {requested.tier ? ` · CAI ${requested.tier}` : ''}
                  {requested.released
                    ? (requested.priceUsd ? ` · ${t.indicative}: $${requested.priceUsd.toLocaleString('en-US')} (${t.oneTime})` : '')
                    : ` · ${t.concept}${requested.priceUsd ? ` · ${t.tierPrice}: $${requested.priceUsd.toLocaleString('en-US')}` : ''}`}
                </p>
              )}
              <fieldset>
                <legend>{t.formTitle}</legend>

                <label htmlFor="email">{t.email}</label>
                <input id="email" type="email" name="email" value={formData.email} onChange={handleInputChange} required aria-required="true" />

                <label htmlFor="company">{t.company}</label>
                <input id="company" type="text" name="company" value={formData.company} onChange={handleInputChange} required aria-required="true" />

                <label htmlFor="role">{t.role}</label>
                <input id="role" type="text" name="role" value={formData.role} onChange={handleInputChange} required aria-required="true" />
              </fieldset>

              <fieldset>
                <legend>{t.agentsTitle}</legend>
                <div className="checkbox-group">
                  {pillarOptions.map(p => (
                    <label key={p.id} className="checkbox-label">
                      <input type="checkbox" checked={formData.agentsOfInterest.includes(p.id)} onChange={() => handleCheckboxChange(p.id)} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>{t.schedule}</legend>

                <label htmlFor="preferredDate">{t.date}</label>
                <input id="preferredDate" type="date" name="preferredDate" min={todayISO()} value={formData.preferredDate} onChange={handleInputChange} required aria-required="true" />

                <label htmlFor="timeZone">{t.timezone}</label>
                <select id="timeZone" name="timeZone" value={formData.timeZone} onChange={handleInputChange}>
                  {Object.entries(t.timezones).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </fieldset>

              <button type="submit" className="demo-submit" disabled={loading}>
                {loading ? t.submitting : t.submit}
              </button>

              {/* Article 13: who is collecting, what for, and where the full
                  notice lives — stated where the data is actually entered. */}
              <p className="demo-privacy">
                {t.privacy}{' '}
                <a href={t.privacyHref}>{t.privacyLink}</a>.
              </p>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
