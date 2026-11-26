/**
 * Interest.jsx - "Register your interest" for an agent that is not on sale (/demo?agent=<slug>&intent=interest).
 * Posts to /api/interest. Data is minimised to what sales needs to qualify the interest; consent is explicit and
 * versioned; no release date is promised. Copy exists for all eight site languages so a page never mixes them.
 */
import { useState } from 'react';
import AVAILABILITY from '../config/availability.json';
import { IL } from './i18n/interestCopy.js';

const C = { paper:'#FBF8F2', graphite:'#2B2A28', terra:'#C65D3A', line:'#E2D9CB', soft:'#4A4641' };

const TECH = ['m365-copilot', 'copilot-studio', 'power-platform', 'azure', 'other', 'not-sure'];
const TIMEFRAME = ['0-3-months', '3-6-months', '6-12-months', '12-plus-months', 'exploring'];
const INDUSTRY = ['financial-services', 'manufacturing', 'public-sector', 'healthcare', 'technology', 'professional-services', 'retail', 'energy-utilities', 'logistics', 'other'];


function interestLocale() {
  const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/(cs|de|fr|es|it|pl|pt)(\/|$)/);
  return m ? m[1] : 'en';
}

export default function Interest({ slug, label, tier }) {
  const lang = interestLocale();
  const t = IL[lang] || IL.en;
  const name = AVAILABILITY.agents?.[slug]?.name || label;
  const [startedAt] = useState(() => Date.now());
  const [f, setF] = useState({ email: '', company: '', role: '', useCase: '', industry: '', techEnvironment: '', timeframe: '', requirements: '', consent: false, website: '' });
  const [state, setState] = useState('idle');
  const on = (e) => { const { name: k, value, type, checked } = e.target; setF((p) => ({ ...p, [k]: type === 'checkbox' ? checked : value })); };

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch('/api/interest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, agent: slug, locale: lang, startedAt }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setState(j.duplicate ? 'duplicate' : 'done');
        try { if (typeof window.va === 'function') window.va('event', { name: 'interest_registered', data: { agent: slug, tier: tier || '', timeframe: f.timeframe || '', tech: f.techEnvironment || '' } }); } catch { /* analytics is optional */ }
      } else setState('error');
    } catch { setState('error'); }
  };

  if (state === 'done' || state === 'duplicate') {
    return <div className="success-msg" role="status" aria-live="polite">{state === 'done' ? t.success : t.duplicate}</div>;
  }
  const sel = (k, list, labels, lbl) => (
    <>
      <label htmlFor={`i-${k}`}>{lbl}</label>
      <select id={`i-${k}`} name={k} value={f[k]} onChange={on}>
        <option value="">{t.choose}</option>
        {list.map((v) => <option key={v} value={v}>{labels[v]}</option>)}
      </select>
    </>
  );
  return (
    <form onSubmit={submit} className="demo-form" data-intent="interest" data-agent={slug}>
      {state === 'error' && <div className="error-msg" role="alert">{t.error}</div>}
      <p className="demo-requested"><strong>{name}</strong>{tier ? ` · CAI ${tier}` : ''} · <span data-availability="coming-soon">{t.status}</span></p>
      <p style={{ fontSize: 14, color: C.soft, margin: '0 0 18px' }}>{t.note}</p>
      <fieldset>
        <legend>{t.legend}</legend>
        <label htmlFor="i-email">{t.email}</label>
        <input id="i-email" type="email" name="email" value={f.email} onChange={on} required autoComplete="email" />
        <label htmlFor="i-company">{t.company}</label>
        <input id="i-company" type="text" name="company" value={f.company} onChange={on} required autoComplete="organization" />
        <label htmlFor="i-role">{t.role}</label>
        <input id="i-role" type="text" name="role" value={f.role} onChange={on} autoComplete="organization-title" />
        <label htmlFor="i-useCase">{t.useCase}</label>
        <textarea id="i-useCase" name="useCase" value={f.useCase} onChange={on} required maxLength={600} rows={3}
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 6, font: 'inherit', fontSize: 14, margin: '0 0 12px' }} />
        {sel('industry', INDUSTRY, t.ind_, t.industry)}
        {sel('techEnvironment', TECH, t.tech_, t.tech)}
        {sel('timeframe', TIMEFRAME, t.tf_, t.timeframe)}
        <label htmlFor="i-requirements">{t.requirements}</label>
        <textarea id="i-requirements" name="requirements" value={f.requirements} onChange={on} maxLength={600} rows={2}
          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 6, font: 'inherit', fontSize: 14, margin: '0 0 12px' }} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="i-website">Website</label>
          <input id="i-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={on} />
        </div>
        <label className="checkbox-label" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" name="consent" checked={f.consent} onChange={on} required style={{ marginTop: 4 }} />
          <span>{t.consent}</span>
        </label>
      </fieldset>
      <button type="submit" className="demo-submit" disabled={state === 'sending'}>{state === 'sending' ? t.submitting : t.submit}</button>
      <p className="demo-privacy">{t.privacy} <a href={t.privacyHref}>{t.privacyLink}</a>.</p>
    </form>
  );
}
