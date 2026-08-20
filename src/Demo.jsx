/**
 * Demo.jsx – /demo is the booking form for demos.
 * Collects: email, company, role, agents of interest (by pillar), preferred date, timezone
 * Submits to: /api/demo-booking
 */
import { useEffect, useState } from 'react';

const C = { cream:'#F5F0E8', paper:'#FBF8F2', graphite:'#2B2A28', terra:'#C65D3A', line:'#E2D9CB', soft:'#4A4641', muted:'#8A857C' };
const serif = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Pillar labels match the live catalogue taxonomy (public/*/agents.html chip
// filters: data-pillar="ops|risk|data|sales|corp") so "agents of interest"
// options are real site categories, not invented product names.
const L = {
  en: {
    title: 'Book Your Demo', subtitle: 'See ColleagueAI in action. Our team will walk you through your use case and pricing.',
    formTitle: 'Your Information', email: 'Email *', company: 'Company *', role: 'Your Role *',
    agentsTitle: 'Areas of Interest', schedule: 'Schedule', date: 'Preferred Date *', timezone: 'Time Zone *',
    submit: 'Request Demo', submitting: 'Submitting…',
    success: 'Demo request received! We’ll contact you within 24 hours.',
    error: 'Failed to submit demo request. Please try again.',
    pillars: { ops: 'Operations & Service', risk: 'Risk, Security & Compliance', data: 'Data & Infrastructure', sales: 'Sales & Marketing', corp: 'Corporate' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/contact', agents:'/agents', title2:'Book a Demo | Colleague AI', desc:'Schedule a personalized demo of governed enterprise AI agents.',
  },
  cs: {
    title: 'Rezervovat demo', subtitle: 'Podívejte se na ColleagueAI v akci. Náš tým vás provede vaším případem použití a cenou.',
    formTitle: 'Vaše údaje', email: 'E-mail *', company: 'Společnost *', role: 'Vaše pozice *',
    agentsTitle: 'Oblasti zájmu', schedule: 'Plán', date: 'Preferované datum *', timezone: 'Časové pásmo *',
    submit: 'Požádat o demo', submitting: 'Odesílání…',
    success: 'Žádost o demo přijata! Kontaktujeme vás do 24 hodin.',
    error: 'Nepodařilo se odeslat žádost o demo. Zkuste to prosím znovu.',
    pillars: { ops: 'Provoz a služby', risk: 'Riziko, bezpečnost a compliance', data: 'Data a infrastruktura', sales: 'Obchod a marketing', corp: 'Korporátní' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/cs/kontakt', agents:'/cs/agenti', title2:'Zarezervovat si demo | Colleague AI', desc:'Naplánujte si personalizovanou ukázku řízeného enterprise AI agenta.',
  },
  de: {
    title: 'Demo buchen', subtitle: 'ColleagueAI in Aktion sehen. Unser Team führt Sie durch Ihren Anwendungsfall und die Preisgestaltung.',
    formTitle: 'Ihre Informationen', email: 'E-Mail *', company: 'Unternehmen *', role: 'Ihre Rolle *',
    agentsTitle: 'Interessensbereiche', schedule: 'Zeitplan', date: 'Bevorzugtes Datum *', timezone: 'Zeitzone *',
    submit: 'Demo anfordern', submitting: 'Wird gesendet…',
    success: 'Demo-Anfrage erhalten! Wir kontaktieren Sie innerhalb von 24 Stunden.',
    error: 'Fehler beim Senden der Demo-Anfrage. Bitte versuchen Sie es erneut.',
    pillars: { ops: 'Betrieb & Service', risk: 'Risiko, Sicherheit & Compliance', data: 'Daten & Infrastruktur', sales: 'Vertrieb & Marketing', corp: 'Unternehmen' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/de/kontakt', agents:'/de/agenten', title2:'Demo buchen | Colleague AI', desc:'Vereinbaren Sie eine personalisierte Demo überwachter Enterprise-AI-Agenten.',
  },
  fr: {
    title: 'Réserver une démo', subtitle: 'Voyez ColleagueAI en action. Notre équipe vous guidera à travers votre cas d’usage et les tarifs.',
    formTitle: 'Vos informations', email: 'E-mail *', company: 'Entreprise *', role: 'Votre rôle *',
    agentsTitle: 'Domaines d’intérêt', schedule: 'Calendrier', date: 'Date préférée *', timezone: 'Fuseau horaire *',
    submit: 'Demander une démo', submitting: 'Envoi en cours…',
    success: 'Demande de démo reçue ! Nous vous contacterons sous 24 heures.',
    error: 'Erreur lors de l’envoi de la demande de démo. Veuillez réessayer.',
    pillars: { ops: 'Opérations & service', risk: 'Risque, sécurité & conformité', data: 'Données & infrastructure', sales: 'Ventes & marketing', corp: 'Fonctions support' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/fr/contact', agents:'/fr/agents', title2:'Réserver une démo | Colleague AI', desc:'Planifiez une démonstration personnalisée des agents IA gouvernés.',
  },
  es: {
    title: 'Reservar demostración', subtitle: 'Vea ColleagueAI en acción. Nuestro equipo le guiará a través de su caso de uso y precios.',
    formTitle: 'Su información', email: 'Correo electrónico *', company: 'Empresa *', role: 'Su rol *',
    agentsTitle: 'Áreas de interés', schedule: 'Horario', date: 'Fecha preferida *', timezone: 'Zona horaria *',
    submit: 'Solicitar demostración', submitting: 'Enviando…',
    success: '¡Solicitud de demostración recibida! Nos pondremos en contacto en 24 horas.',
    error: 'Error al enviar la solicitud de demostración. Inténtelo de nuevo.',
    pillars: { ops: 'Operaciones y servicio', risk: 'Riesgo, seguridad y cumplimiento', data: 'Datos e infraestructura', sales: 'Ventas y marketing', corp: 'Corporativo' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/es/contacto', agents:'/es/agentes', title2:'Reservar una demo | Colleague AI', desc:'Programe una demostración personalizada de agentes IA gobernados.',
  },
  it: {
    title: 'Prenota demo', subtitle: 'Vedi ColleagueAI in azione. Il nostro team ti guiderà attraverso il tuo caso d’uso e i prezzi.',
    formTitle: 'Le tue informazioni', email: 'E-mail *', company: 'Azienda *', role: 'Il tuo ruolo *',
    agentsTitle: 'Aree di interesse', schedule: 'Programma', date: 'Data preferita *', timezone: 'Fuso orario *',
    submit: 'Richiedi demo', submitting: 'Invio in corso…',
    success: 'Richiesta demo ricevuta! Ti contatteremo entro 24 ore.',
    error: 'Errore nell’invio della richiesta di demo. Riprova.',
    pillars: { ops: 'Operations e servizio', risk: 'Rischio, sicurezza e compliance', data: 'Dati e infrastruttura', sales: 'Vendite e marketing', corp: 'Corporate' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/it/contatti', agents:'/it/agenti', title2:'Prenota una demo | Colleague AI', desc:'Pianifica una demo personalizzata di agenti IA governati.',
  },
  pl: {
    title: 'Zarezerwuj demo', subtitle: 'Zobacz ColleagueAI w akcji. Nasz zespół przeprowadzi Cię przez Twój przypadek użycia i ceny.',
    formTitle: 'Twoje informacje', email: 'E-mail *', company: 'Firma *', role: 'Twoja rola *',
    agentsTitle: 'Obszary zainteresowania', schedule: 'Harmonogram', date: 'Preferowana data *', timezone: 'Strefa czasowa *',
    submit: 'Poproś o demo', submitting: 'Wysyłanie…',
    success: 'Otrzymano prośbę o demo! Skontaktujemy się w ciągu 24 godzin.',
    error: 'Błąd przy przesyłaniu prośby o demo. Spróbuj ponownie.',
    pillars: { ops: 'Operacje i usługi', risk: 'Ryzyko, bezpieczeństwo i zgodność', data: 'Dane i infrastruktura', sales: 'Sprzedaż i marketing', corp: 'Korporacyjne' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/pl/kontakt', agents:'/pl/agenci', title2:'Zarezerwuj demo | Colleague AI', desc:'Zaplanuj spersonalizowaną demonstrację nadzorowanych agentów AI.',
  },
  pt: {
    title: 'Agendar demo', subtitle: 'Veja a ColleagueAI em ação. Nossa equipe vai guiar você pelo seu caso de uso e preços.',
    formTitle: 'Suas informações', email: 'E-mail *', company: 'Empresa *', role: 'Seu cargo *',
    agentsTitle: 'Áreas de interesse', schedule: 'Agenda', date: 'Data preferida *', timezone: 'Fuso horário *',
    submit: 'Solicitar demo', submitting: 'Enviando…',
    success: 'Solicitação de demo recebida! Entraremos em contato em até 24 horas.',
    error: 'Erro ao enviar a solicitação de demo. Tente novamente.',
    pillars: { ops: 'Operações e serviço', risk: 'Risco, segurança e conformidade', data: 'Dados e infraestrutura', sales: 'Vendas e marketing', corp: 'Corporativo' },
    timezones: { UTC: 'UTC', EST: 'EST (UTC-5)', CST: 'CST (UTC-6)', MST: 'MST (UTC-7)', PST: 'PST (UTC-8)', CET: 'CET (UTC+1)', CEST: 'CEST (UTC+2)' },
    contact:'/pt/contacto', agents:'/pt/agentes', title2:'Agendar uma demo | Colleague AI', desc:'Agende uma demonstração personalizada de agentes IA governados.',
  },
};

function copy() {
  const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/(cs|de|fr|es|it|pl|pt)(\/|$)/);
  return L[m ? m[1] : 'en'] || L.en;
}

export default function Demo() {
  const t = copy();

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
        body: JSON.stringify(formData),
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
        .demo-kicker { font-family: ui-monospace, Consolas, monospace; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: ${C.muted}; display: block; margin-bottom: 16px; }
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
                <input id="preferredDate" type="date" name="preferredDate" value={formData.preferredDate} onChange={handleInputChange} required aria-required="true" />

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
            </form>
          </>
        )}
      </main>
    </div>
  );
}
