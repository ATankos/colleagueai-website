import { useState, useEffect } from 'react';

// Download URLs — replace with real GitHub Release links once installers are built
const DOWNLOADS = {
  windows: 'https://github.com/ATankos/colleagueai-desktop/releases/latest/download/Colleague-AI-Setup.exe',
  mac:     'https://github.com/ATankos/colleagueai-desktop/releases/latest/download/Colleague-AI.dmg',
};

function detectOS() {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'windows';
  if (ua.includes('Mac')) return 'mac';
  return 'other';
}

const translations = {
  en: {
    eyebrow: 'LIVE AGENT DEMO',
    h1a: 'Try it before you',
    h1b: 'buy it.',
    sub: 'A live Colleague AI agent — running on real AI, explaining its reasoning in plain language.',
    back: '← Back',
    agentCategory: 'Travel / Procurement',
    agentDesc: 'Analyses available flights against your stated preferences — price, duration, layover comfort, and risk — and explains its recommendation in plain language. The same reasoning engine we embed in enterprise procurement workflows.',
    roiLabel: 'ROI',
    roiValue: 'Save 45 min per booking decision',
    deployLabel: 'DEPLOY TIME',
    deployValue: '~ instant (hosted demo)',
    reviewedLabel: 'REVIEWED BY',
    downloadEyebrow: 'DOWNLOAD',
    downloadTitle: 'Install on your computer',
    downloadSub: 'Download the desktop app and the AI Flight Advisor runs directly on your machine — no browser needed.',
    downloadWin: 'Download for Windows',
    downloadMac: 'Download for Mac',
    downloadWinShort: 'Windows',
    downloadMacShort: 'Mac',
    downloadMacAlt: 'Mac version',
    downloadWinAlt: 'Windows version',
    downloadFree: 'Free · No account needed · v0.1.0',
    demoEyebrow: 'LIVE REASONING ENGINE',
    demoTitle: 'Run the agent on your search',
    demoSub: 'Mock flight data · Agent reasoning is real · Not a booking tool',
    labelFrom: 'From',
    labelTo: 'To',
    labelDate: 'Date',
    labelCabin: 'Cabin',
    labelPrefs: 'Your preferences',
    prefsDefault: 'Cheapest option, but avoid overnight layovers and very short connections.',
    cabinEconomy: 'Economy',
    cabinPremium: 'Premium Economy',
    cabinBusiness: 'Business',
    runBtn: 'Run agent →',
    runningBtn: 'Agent is reasoning…',
    rankedLabel: 'AGENT RANKED',
    rankedSuffix: 'OPTIONS',
    footerNote: 'This is a live demo of Colleague AI\'s reasoning engine.',
    footerLink: 'See all agents →',
  },
  cs: {
    eyebrow: 'ŽIVÁ UKÁZKA AGENTA',
    h1a: 'Vyzkoušejte před',
    h1b: 'nákupem.',
    sub: 'Živý agent Colleague AI — běží na skutečné AI a vysvětluje své uvažování srozumitelným jazykem.',
    back: '← Zpět',
    agentCategory: 'Cestování / Nákup',
    agentDesc: 'Analyzuje dostupné lety podle vašich preferencí — cena, délka letu, pohodlí přestupu a riziko — a doporučení vysvětluje srozumitelně. Stejný reasoning engine, který nasazujeme v podnikových nákupních procesech.',
    roiLabel: 'ÚSPORA',
    roiValue: 'Ušetřete 45 min na každém výběru letu',
    deployLabel: 'NASAZENÍ',
    deployValue: '~ okamžitě (hosted demo)',
    reviewedLabel: 'OVĚŘENO',
    downloadEyebrow: 'STAŽENÍ',
    downloadTitle: 'Nainstalujte do počítače',
    downloadSub: 'Stáhněte desktopovou aplikaci a AI Flight Advisor poběží přímo na vašem počítači — bez prohlížeče.',
    downloadWin: 'Stáhnout pro Windows',
    downloadMac: 'Stáhnout pro Mac',
    downloadWinShort: 'Windows',
    downloadMacShort: 'Mac',
    downloadMacAlt: 'Verze pro Mac',
    downloadWinAlt: 'Verze pro Windows',
    downloadFree: 'Zdarma · Bez registrace · v0.1.0',
    demoEyebrow: 'ŽIVÝ REASONING ENGINE',
    demoTitle: 'Spusťte agenta na vlastním hledání',
    demoSub: 'Testovací data letů · Uvažování agenta je skutečné · Není to rezervační nástroj',
    labelFrom: 'Odkud',
    labelTo: 'Kam',
    labelDate: 'Datum',
    labelCabin: 'Třída',
    labelPrefs: 'Vaše preference',
    prefsDefault: 'Nejlevnější možnost, ale vyhněte se nočním přestupům a velmi krátkým spojům.',
    cabinEconomy: 'Ekonomická',
    cabinPremium: 'Prémiová ekonomická',
    cabinBusiness: 'Business',
    runBtn: 'Spustit agenta →',
    runningBtn: 'Agent přemýšlí…',
    rankedLabel: 'AGENT SEŘADIL',
    rankedSuffix: 'MOŽNOSTI',
    footerNote: 'Toto je živá ukázka reasoning engine od Colleague AI.',
    footerLink: 'Zobrazit všechny agenty →',
  },
};

const AGENT = {
  id: 'PKG-TRV-0001',
  icon: '✈',
  iconBg: '#FFE8DC',
  name: 'AI Flight Advisor',
  risk: 'L1',
  score: 'A',
  scoreColor: '#A8482A',
  price: '€0',
  priceSub: 'free demo',
  reviewer: 'Colleague AI',
  reviewed: 'Květen 2026 / May 2026',
};

export default function Demo() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [lang, setLang] = useState('en');
  const os = detectOS();
  const t = translations[lang];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); setInstallPrompt(e); });
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults([]);
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch('/api/demo-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setResults(data.results ?? []);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ backgroundColor: '#F5F0E8', color: '#1D1B1A', fontFamily: "'Geist', -apple-system, sans-serif", minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { -webkit-font-smoothing: antialiased; }
        .fraunces { font-family: 'Fraunces', serif; font-variation-settings: 'opsz' 144; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .demo-input { width: 100%; border: 1px solid rgba(29,27,26,0.12); border-radius: 10px; padding: 10px 14px; font-size: 15px; background: #FAF6EC; color: #1D1B1A; font-family: inherit; }
        .demo-input:focus { outline: 2px solid #A8482A; outline-offset: 2px; }
        .result-card { background: #fff; border: 1px solid rgba(29,27,26,0.06); border-radius: 16px; padding: 20px; margin-top: 14px; }
        .install-btn { transition: all 0.2s ease; }
        .install-btn:hover { transform: scale(1.02); }
        @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '0 22px', height: '48px',
        backgroundColor: scrolled ? 'rgba(245,240,232,0.72)' : 'rgba(245,240,232,0.5)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        transition: 'all 0.3s ease',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        borderBottom: '1px solid rgba(29,27,26,0.06)',
      }}>
        <div style={{ maxWidth: '1024px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: '17px', fontWeight: 500, letterSpacing: '-0.02em', color: 'inherit', textDecoration: 'none' }}>
            colleague<span style={{ color: '#A8482A' }}>ai</span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {installPrompt && !installed && (
              <button className="install-btn" onClick={handleInstall} style={{
                background: '#1D1B1A', color: '#F5F0E8', border: 0,
                borderRadius: '999px', padding: '6px 16px',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>⬇ Install app</button>
            )}
            {installed && <span style={{ fontSize: '12px', color: '#A8482A', fontWeight: 600 }}>✓ Installed</span>}
            <div className="mono" style={{ display: 'flex', gap: '2px', fontSize: '11px' }}>
              <button onClick={() => setLang('en')} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: lang === 'en' ? '#1D1B1A' : '#6B655E', fontWeight: lang === 'en' ? 600 : 400 }}>EN</button>
              <span style={{ color: '#6B655E' }}>·</span>
              <button onClick={() => setLang('cs')} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: lang === 'cs' ? '#1D1B1A' : '#6B655E', fontWeight: lang === 'cs' ? 600 : 400 }}>CS</button>
            </div>
            <a href="/" style={{ fontSize: '12px', color: '#6B655E', textDecoration: 'none' }}>{t.back}</a>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '80px 24px 60px' }}>

        {/* EYEBROW */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div className="mono" style={{ fontSize: '10px', color: '#A8482A', letterSpacing: '0.12em', marginBottom: '14px' }}>
            {t.eyebrow}
          </div>
          <h1 className="fraunces" style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: '14px' }}>
            {t.h1a}<br /><span style={{ fontStyle: 'italic' }}>{t.h1b}</span>
          </h1>
          <p style={{ fontSize: '16px', color: '#6B655E', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>
            {t.sub}
          </p>
        </div>

        {/* AGENT CARD */}
        <div style={{
          background: '#fff', borderRadius: '20px', padding: '28px',
          border: '1px solid rgba(29,27,26,0.05)',
          boxShadow: '0 4px 24px rgba(29,27,26,0.06)', marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: AGENT.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                {AGENT.icon}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className="mono" style={{ fontSize: '10px', color: '#6B655E', letterSpacing: '0.08em' }}>{AGENT.id}</span>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(29,27,26,0.05)', color: '#6B655E' }}>Risk {AGENT.risk}</span>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#FFE8DC', color: AGENT.scoreColor, fontWeight: 700 }}>Score {AGENT.score}</span>
                </div>
                <h2 className="fraunces" style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '4px' }}>{AGENT.name}</h2>
                <div style={{ fontSize: '12px', color: '#6B655E' }}>{t.agentCategory} · {AGENT.platform}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fraunces" style={{ fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em', color: '#1D1B1A' }}>{AGENT.price}</div>
              <div style={{ fontSize: '12px', color: '#6B655E' }}>{AGENT.priceSub}</div>
            </div>
          </div>

          <p style={{ fontSize: '14px', color: '#4A4641', lineHeight: 1.6, margin: '20px 0', borderTop: '1px solid rgba(29,27,26,0.06)', paddingTop: '20px' }}>
            {t.agentDesc}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { label: t.roiLabel, value: t.roiValue },
              { label: t.deployLabel, value: t.deployValue },
              { label: t.reviewedLabel, value: AGENT.reviewer + ' · ' + AGENT.reviewed },
            ].map((item, i) => (
              <div key={i} style={{ background: '#F5F0E8', borderRadius: '12px', padding: '14px' }}>
                <div className="mono" style={{ fontSize: '9px', color: '#A8482A', letterSpacing: '0.1em', marginBottom: '6px' }}>{item.label}</div>
                <div style={{ fontSize: '13px', color: '#1D1B1A', fontWeight: 500 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* DOWNLOAD SECTION */}
        <div style={{
          background: '#1D1B1A', borderRadius: '20px', padding: '32px 28px',
          marginBottom: '24px', textAlign: 'center',
        }}>
          <div className="mono" style={{ fontSize: '10px', color: '#A8482A', letterSpacing: '0.12em', marginBottom: '12px' }}>
            {t.downloadEyebrow}
          </div>
          <h3 className="fraunces" style={{ fontSize: '24px', fontWeight: 500, letterSpacing: '-0.02em', color: '#F5F0E8', marginBottom: '8px' }}>
            {t.downloadTitle}
          </h3>
          <p style={{ fontSize: '14px', color: '#A39B91', marginBottom: '28px', lineHeight: 1.6 }}>
            {t.downloadSub}
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* Primary button — matches detected OS */}
            {os === 'windows' && (
              <a href={DOWNLOADS.windows} style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                background: '#F5F0E8', color: '#1D1B1A',
                padding: '14px 28px', borderRadius: '12px',
                fontSize: '15px', fontWeight: 600, textDecoration: 'none',
              }}>
                <span>⊞</span> {t.downloadWin}
              </a>
            )}
            {os === 'mac' && (
              <a href={DOWNLOADS.mac} style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                background: '#F5F0E8', color: '#1D1B1A',
                padding: '14px 28px', borderRadius: '12px',
                fontSize: '15px', fontWeight: 600, textDecoration: 'none',
              }}>
                <span></span> {t.downloadMac}
              </a>
            )}
            {os === 'other' && (
              <>
                <a href={DOWNLOADS.windows} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  background: '#F5F0E8', color: '#1D1B1A',
                  padding: '14px 28px', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 600, textDecoration: 'none',
                }}>
                  <span>⊞</span> {t.downloadWinShort}
                </a>
                <a href={DOWNLOADS.mac} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  background: 'rgba(245,240,232,0.1)', color: '#F5F0E8',
                  padding: '14px 28px', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 600, textDecoration: 'none',
                  border: '1px solid rgba(245,240,232,0.2)',
                }}>
                  <span></span> {t.downloadMacShort}
                </a>
              </>
            )}

            {/* Secondary button — other platform */}
            {os === 'windows' && (
              <a href={DOWNLOADS.mac} style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                background: 'rgba(245,240,232,0.1)', color: '#A39B91',
                padding: '14px 28px', borderRadius: '12px',
                fontSize: '14px', fontWeight: 500, textDecoration: 'none',
                border: '1px solid rgba(245,240,232,0.12)',
              }}>
                <span></span> {t.downloadMacAlt}
              </a>
            )}
            {os === 'mac' && (
              <a href={DOWNLOADS.windows} style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                background: 'rgba(245,240,232,0.1)', color: '#A39B91',
                padding: '14px 28px', borderRadius: '12px',
                fontSize: '14px', fontWeight: 500, textDecoration: 'none',
                border: '1px solid rgba(245,240,232,0.12)',
              }}>
                <span>⊞</span> {t.downloadWinAlt}
              </a>
            )}
          </div>

          <p style={{ fontSize: '11px', color: '#6B655E', marginTop: '20px' }}>
            {t.downloadFree}
          </p>
        </div>

        {/* LIVE DEMO SECTION */}
        <div style={{ background: '#fff', borderRadius: '20px', padding: '28px', border: '1px solid rgba(29,27,26,0.05)', boxShadow: '0 4px 24px rgba(29,27,26,0.06)' }}>
          <div style={{ marginBottom: '24px' }}>
            <div className="mono" style={{ fontSize: '10px', color: '#A8482A', letterSpacing: '0.12em', marginBottom: '8px' }}>{t.demoEyebrow}</div>
            <h3 className="fraunces" style={{ fontSize: '20px', fontWeight: 500, letterSpacing: '-0.02em' }}>{t.demoTitle}</h3>
            <p style={{ fontSize: '13px', color: '#6B655E', marginTop: '4px' }}>{t.demoSub}</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
            <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A4641', marginBottom: '6px' }}>{t.labelFrom}</label>
                <input name="origin" className="demo-input" placeholder="ZRH" defaultValue="ZRH" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A4641', marginBottom: '6px' }}>{t.labelTo}</label>
                <input name="destination" className="demo-input" placeholder="YYZ" defaultValue="YYZ" required />
              </div>
            </div>
            <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A4641', marginBottom: '6px' }}>{t.labelDate}</label>
                <input name="departureDate" type="date" className="demo-input" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A4641', marginBottom: '6px' }}>{t.labelCabin}</label>
                <select name="cabin" className="demo-input">
                  <option value="ECONOMY">{t.cabinEconomy}</option>
                  <option value="PREMIUM_ECONOMY">{t.cabinPremium}</option>
                  <option value="BUSINESS">{t.cabinBusiness}</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A4641', marginBottom: '6px' }}>{t.labelPrefs}</label>
              <textarea name="preferences" className="demo-input" style={{ minHeight: '72px', resize: 'vertical' }}
                defaultValue={t.prefsDefault} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '14px', background: loading ? '#6B655E' : '#1D1B1A',
              color: '#F5F0E8', border: 0, borderRadius: '12px', fontSize: '15px',
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              transition: 'background 0.2s',
            }}>
              {loading ? t.runningBtn : t.runBtn}
            </button>
          </form>

          {error && <p style={{ color: '#A8482A', fontSize: '14px', marginTop: '14px', textAlign: 'center' }}>{error}</p>}

          {results.length > 0 && (
            <div style={{ marginTop: '24px', borderTop: '1px solid rgba(29,27,26,0.06)', paddingTop: '24px' }}>
              <div className="mono" style={{ fontSize: '10px', color: '#6B655E', letterSpacing: '0.08em', marginBottom: '12px' }}>
                {t.rankedLabel} {results.length} {t.rankedSuffix}
              </div>
              {results.map((r, i) => (
                <div key={i} className="result-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h4 className="fraunces" style={{ fontSize: '17px', fontWeight: 500 }}>{r.airline}</h4>
                    <span style={{ background: '#FFE8DC', color: '#A8482A', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>
                      Score {r.score}/100
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#6B655E', marginBottom: '8px' }}>
                    {r.route} · {r.departure} → {r.arrival} · {r.duration} · {r.stops} stop(s)
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>{r.price}</div>
                  <p style={{ fontSize: '13px', color: '#4A4641', lineHeight: 1.5 }}>{r.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER NOTE */}
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#A39B91', marginTop: '32px' }}>
          {t.footerNote} <a href="/" style={{ color: '#A8482A' }}>{t.footerLink}</a>
        </p>
      </div>
    </div>
  );
}
