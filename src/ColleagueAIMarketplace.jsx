import { useState, useEffect, useRef } from 'react';

const LOCALES = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'cs', flag: '🇨🇿', name: 'Čeština' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'sk', flag: '🇸🇰', name: 'Slovenčina' },
];

export default function ColleagueAIMarketplace() {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('cai-lang');
      return LOCALES.some(l => l.code === saved) ? saved : 'en';
    } catch { return 'en'; }
  });
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cai-lang', lang); } catch {}
  }, [lang]);

  useEffect(() => {
    const handler = (e) => { if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const t = translations[lang] ?? translations.en;

  const filteredAgents = filter === 'all'
    ? t.agents
    : t.agents.filter(a => a.category === filter);

  return (
    <div style={{
      backgroundColor: '#F5F0E8',
      color: '#1D1B1A',
      fontFamily: "'Geist', -apple-system, sans-serif",
      minHeight: '100vh',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { -webkit-font-smoothing: antialiased; }

        .fraunces { font-family: 'Fraunces', serif; font-variation-settings: 'opsz' 144; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 1s cubic-bezier(0.16, 1, 0.3, 1) backwards; }

        a { color: inherit; text-decoration: none; }
        button { border: none; background: none; cursor: pointer; font-family: inherit; }

        .link-hover { transition: opacity 0.2s; }
        .link-hover:hover { opacity: 0.6; }

        .agent-card {
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;
        }
        .agent-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(29, 27, 26, 0.08);
        }

        .filter-pill {
          transition: all 0.2s ease;
        }

        .cta-button {
          transition: all 0.2s ease;
        }
        .cta-button:hover {
          transform: scale(1.02);
        }

        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
        }

        .lang-pill {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(29, 27, 26, 0.20);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          color: #1D1B1A;
          background: transparent;
          cursor: pointer;
          transition: border-color 0.2s;
          white-space: nowrap;
          user-select: none;
          line-height: 1;
        }
        .lang-pill:hover { border-color: rgba(29, 27, 26, 0.45); }
        .lang-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          background: rgba(245, 240, 232, 0.98);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(29, 27, 26, 0.12);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(29, 27, 26, 0.14);
          overflow: hidden;
          z-index: 200;
          min-width: 130px;
        }
        .lang-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 400;
          color: #1D1B1A;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
        }
        .lang-option:hover { background: rgba(29, 27, 26, 0.06); }
        .lang-option.active { font-weight: 600; }
      `}</style>

      {/* APPLE-STYLE NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        padding: '0 22px', height: '48px',
        backgroundColor: scrolled ? 'rgba(245, 240, 232, 0.72)' : 'rgba(245, 240, 232, 0.5)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        transition: 'all 0.3s ease',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        borderBottom: '1px solid rgba(29, 27, 26, 0.06)',
      }}>
        <div style={{
          maxWidth: '1024px', width: '100%',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: '17px', fontWeight: 500, letterSpacing: '-0.02em' }}>
            <span>colleague</span>
            <span style={{ color: '#A8482A' }}>ai</span>
          </div>

          <div className="hide-mobile" style={{
            display: 'flex', gap: '32px', alignItems: 'center', fontSize: '12px',
          }}>
            <a href="#marketplace" className="link-hover">{t.nav.marketplace}</a>
            <a href="#trust" className="link-hover">{t.nav.trust}</a>
            <a href="#philosophy" className="link-hover">{t.nav.philosophy}</a>
            <a href="#pricing" className="link-hover">{t.nav.pricing}</a>
            <a href="#contact" className="link-hover">{t.nav.contact}</a>
          </div>

          <div ref={langRef} style={{ position: 'relative' }}>
            <button
              className="lang-pill"
              onClick={() => setLangOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
            >
              <span>{LOCALES.find(l => l.code === lang)?.flag ?? '🌐'}</span>
              <span>{(LOCALES.find(l => l.code === lang)?.code ?? 'EN').toUpperCase()}</span>
              <span style={{ fontSize: '8px', opacity: 0.55, marginLeft: '2px' }}>▾</span>
            </button>
            {langOpen && (
              <div className="lang-dropdown" role="listbox">
                {LOCALES.map(loc => (
                  <button
                    key={loc.code}
                    role="option"
                    aria-selected={lang === loc.code}
                    className={`lang-option${lang === loc.code ? ' active' : ''}`}
                    onClick={() => { setLang(loc.code); setLangOpen(false); }}
                  >
                    <span>{loc.flag}</span>
                    <span style={{ minWidth: '22px' }}>{loc.code.toUpperCase()}</span>
                    <span style={{ color: '#6B655E', fontWeight: 400 }}>{loc.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* HERO TILE — Apple style */}
      <section style={{
        paddingTop: '120px', paddingBottom: '80px',
        textAlign: 'center', padding: '120px 22px 80px',
      }}>
        <div className="fade-up mono" style={{
          fontSize: '12px', color: '#A8482A', letterSpacing: '0.05em',
          marginBottom: '20px', animationDelay: '0.1s',
        }}>
          {t.hero.eyebrow}
        </div>

        <h1 className="fade-up fraunces" style={{
          fontSize: 'clamp(48px, 7vw, 96px)', fontWeight: 500,
          lineHeight: 1.05, letterSpacing: '-0.035em',
          marginBottom: '24px', maxWidth: '900px', margin: '0 auto 24px',
          animationDelay: '0.2s',
        }}>
          {t.hero.h1a} <span style={{ fontStyle: 'italic', fontWeight: 400 }}>{t.hero.h1b}</span>
        </h1>

        <p className="fade-up" style={{
          fontSize: 'clamp(20px, 2vw, 28px)', lineHeight: 1.35,
          color: '#4A4641', fontWeight: 400,
          maxWidth: '720px', margin: '0 auto 40px',
          animationDelay: '0.35s',
        }}>
          {t.hero.sub}
        </p>

        <div className="fade-up" style={{
          display: 'flex', gap: '24px', justifyContent: 'center',
          animationDelay: '0.5s', flexWrap: 'wrap',
        }}>
          <a href="#marketplace" className="cta-button" style={{
            padding: '14px 28px', backgroundColor: '#1D1B1A', color: '#F5F0E8',
            borderRadius: '999px', fontSize: '15px', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: '8px',
          }}>
            {t.hero.cta1} <span>→</span>
          </a>
          <a href="#trust" className="link-hover" style={{
            padding: '14px 28px', color: '#A8482A', fontSize: '15px', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: '8px',
          }}>
            {t.hero.cta2} <span>→</span>
          </a>
        </div>

        {/* Stats strip */}
        <div className="fade-up" style={{
          marginTop: '80px', display: 'flex', gap: '60px', justifyContent: 'center',
          flexWrap: 'wrap', animationDelay: '0.7s',
        }}>
          {t.hero.stats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div className="fraunces" style={{
                fontSize: '40px', fontWeight: 500, color: '#1D1B1A',
                letterSpacing: '-0.02em',
              }}>{s.num}</div>
              <div className="mono" style={{
                fontSize: '11px', color: '#6B655E', letterSpacing: '0.05em',
                marginTop: '4px',
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TRUST TILE — dark, like Apple's Pro product blocks */}
      <section id="trust" style={{
        margin: '16px', borderRadius: '24px',
        backgroundColor: '#1D1B1A', color: '#F5F0E8',
        padding: '100px 40px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="mono" style={{
          fontSize: '12px', color: '#E89270', letterSpacing: '0.1em',
          marginBottom: '24px',
        }}>
          {t.trustTile.eyebrow}
        </div>

        <h2 className="fraunces" style={{
          fontSize: 'clamp(40px, 5.5vw, 80px)', fontWeight: 500,
          lineHeight: 1.05, letterSpacing: '-0.03em',
          marginBottom: '28px', maxWidth: '900px', margin: '0 auto 28px',
        }}>
          {t.trustTile.h2a} <span style={{ fontStyle: 'italic', color: '#E89270' }}>{t.trustTile.h2b}</span>
        </h2>

        <p style={{
          fontSize: '20px', lineHeight: 1.5, color: '#D4CCBF',
          maxWidth: '640px', margin: '0 auto 60px',
        }}>
          {t.trustTile.sub}
        </p>

        {/* CAI Score showcase */}
        <div style={{
          maxWidth: '520px', margin: '0 auto',
          backgroundColor: 'rgba(245, 240, 232, 0.04)',
          border: '1px solid rgba(245, 240, 232, 0.1)',
          borderRadius: '20px', padding: '40px',
          textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div className="fraunces" style={{
              fontSize: '88px', fontWeight: 500, color: '#E89270',
              letterSpacing: '-0.04em', lineHeight: 1,
            }}>A+</div>
            <div style={{ flex: 1 }}>
              <div className="mono" style={{
                fontSize: '11px', color: '#A39B91', letterSpacing: '0.1em',
                marginBottom: '6px',
              }}>CAI SCORE™</div>
              <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '6px' }}>
                {t.trustTile.scoreTitle}
              </div>
              <div style={{ fontSize: '13px', color: '#A39B91' }}>
                {t.trustTile.scoreSub}
              </div>
            </div>
          </div>

          <div style={{
            marginTop: '24px', paddingTop: '24px',
            borderTop: '1px solid rgba(245, 240, 232, 0.1)',
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
          }}>
            {t.trustTile.metrics.map((m, i) => (
              <div key={i}>
                <div className="mono" style={{
                  fontSize: '10px', color: '#A39B91', marginBottom: '4px',
                }}>{m.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#F5F0E8' }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <a href="#" className="link-hover" style={{
          display: 'inline-block', marginTop: '40px',
          color: '#E89270', fontSize: '15px', fontWeight: 500,
          borderBottom: '1px solid #E89270', paddingBottom: '2px',
        }}>
          {t.trustTile.cta} →
        </a>
      </section>

      {/* MARKETPLACE — agent grid */}
      <section id="marketplace" style={{ padding: '100px 22px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div className="mono" style={{
              fontSize: '12px', color: '#A8482A', letterSpacing: '0.1em',
              marginBottom: '20px',
            }}>
              {t.market.eyebrow}
            </div>
            <h2 className="fraunces" style={{
              fontSize: 'clamp(40px, 5vw, 72px)', fontWeight: 500,
              lineHeight: 1.05, letterSpacing: '-0.03em',
              marginBottom: '20px',
            }}>
              {t.market.h2a} <span style={{ fontStyle: 'italic' }}>{t.market.h2b}</span>
            </h2>
            <p style={{
              fontSize: '19px', color: '#4A4641', maxWidth: '560px',
              margin: '0 auto', lineHeight: 1.4,
            }}>
              {t.market.sub}
            </p>
          </div>

          {/* Filter pills */}
          <div style={{
            display: 'flex', gap: '8px', justifyContent: 'center',
            marginBottom: '40px', flexWrap: 'wrap',
          }}>
            {t.market.filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="filter-pill"
                style={{
                  padding: '8px 18px', borderRadius: '999px',
                  fontSize: '13px', fontWeight: 500,
                  backgroundColor: filter === f.id ? '#1D1B1A' : 'transparent',
                  color: filter === f.id ? '#F5F0E8' : '#1D1B1A',
                  border: filter === f.id ? '1px solid #1D1B1A' : '1px solid rgba(29, 27, 26, 0.15)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Agent grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}>
            {filteredAgents.map((agent, i) => (
              <div key={i} className="agent-card" style={{
                backgroundColor: '#FFFFFF', borderRadius: '20px',
                padding: '28px', cursor: 'pointer',
                border: '1px solid rgba(29, 27, 26, 0.05)',
                display: 'flex', flexDirection: 'column',
                minHeight: '280px',
              }}>
                {/* Icon block */}
                <div style={{
                  width: '56px', height: '56px', borderRadius: '14px',
                  backgroundColor: agent.color, marginBottom: '20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px',
                }}>
                  {agent.icon}
                </div>

                {/* Score badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  marginBottom: '12px',
                }}>
                  <span className="mono" style={{
                    fontSize: '10px', color: '#6B655E', letterSpacing: '0.05em',
                  }}>CAI</span>
                  <span className="fraunces" style={{
                    fontSize: '13px', fontWeight: 500, color: agent.scoreColor,
                  }}>{agent.score}</span>
                  <span style={{
                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                    backgroundColor: 'rgba(29, 27, 26, 0.05)', color: '#6B655E',
                  }}>{agent.risk}</span>
                </div>

                <h3 className="fraunces" style={{
                  fontSize: '22px', fontWeight: 500, marginBottom: '8px',
                  letterSpacing: '-0.01em',
                }}>{agent.name}</h3>

                <p style={{
                  fontSize: '14px', lineHeight: 1.5, color: '#4A4641',
                  flex: 1, marginBottom: '20px',
                }}>{agent.desc}</p>

                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: '16px', borderTop: '1px solid rgba(29, 27, 26, 0.06)',
                }}>
                  <div className="mono" style={{ fontSize: '11px', color: '#6B655E' }}>
                    {agent.deployments}
                  </div>
                  <div style={{
                    fontSize: '13px', color: '#A8482A', fontWeight: 500,
                  }}>
                    {t.market.viewDetails} →
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PHILOSOPHY TILE — clean centered */}
      <section id="philosophy" style={{
        padding: '120px 22px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div className="mono" style={{
            fontSize: '12px', color: '#A8482A', letterSpacing: '0.1em',
            marginBottom: '24px',
          }}>
            {t.phil.eyebrow}
          </div>

          <p className="fraunces" style={{
            fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400,
            lineHeight: 1.25, letterSpacing: '-0.01em',
            fontStyle: 'italic', color: '#1D1B1A',
          }}>
            "{t.phil.quote}"
          </p>

          <div className="mono" style={{
            fontSize: '11px', color: '#6B655E', marginTop: '32px',
            letterSpacing: '0.1em',
          }}>
            — {t.phil.attr}
          </div>
        </div>
      </section>

      {/* PRICING TILE */}
      <section id="pricing" style={{
        margin: '16px', borderRadius: '24px',
        backgroundColor: '#EDE5D8', padding: '100px 40px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div className="mono" style={{
              fontSize: '12px', color: '#A8482A', letterSpacing: '0.1em',
              marginBottom: '20px',
            }}>
              {t.price.eyebrow}
            </div>
            <h2 className="fraunces" style={{
              fontSize: 'clamp(36px, 4.5vw, 64px)', fontWeight: 500,
              lineHeight: 1.05, letterSpacing: '-0.03em',
            }}>
              {t.price.h2a} <span style={{ fontStyle: 'italic' }}>{t.price.h2b}</span>
            </h2>
          </div>

          <div style={{
            display: 'grid', gap: '16px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            {t.price.tiers.map((tier, i) => (
              <div key={i} style={{
                backgroundColor: tier.featured ? '#1D1B1A' : '#F5F0E8',
                color: tier.featured ? '#F5F0E8' : '#1D1B1A',
                padding: '36px 28px', borderRadius: '20px',
                position: 'relative',
              }}>
                {tier.featured && (
                  <div className="mono" style={{
                    position: 'absolute', top: '20px', right: '20px',
                    fontSize: '10px', color: '#E89270', letterSpacing: '0.1em',
                  }}>
                    {t.price.popular}
                  </div>
                )}

                <div className="mono" style={{
                  fontSize: '11px', letterSpacing: '0.1em',
                  color: tier.featured ? '#A39B91' : '#6B655E',
                  marginBottom: '12px',
                }}>
                  {tier.tag}
                </div>
                <h3 className="fraunces" style={{
                  fontSize: '28px', fontWeight: 500, marginBottom: '8px',
                  letterSpacing: '-0.01em',
                }}>{tier.name}</h3>

                <div style={{ marginBottom: '24px' }}>
                  <span className="fraunces" style={{
                    fontSize: '40px', fontWeight: 500, letterSpacing: '-0.02em',
                  }}>{tier.price}</span>
                  <span style={{
                    fontSize: '14px',
                    color: tier.featured ? '#A39B91' : '#6B655E',
                    marginLeft: '4px',
                  }}>{tier.period}</span>
                </div>

                <div style={{
                  height: '1px',
                  backgroundColor: tier.featured ? 'rgba(245, 240, 232, 0.1)' : 'rgba(29, 27, 26, 0.08)',
                  marginBottom: '20px',
                }} />

                <ul style={{ listStyle: 'none', marginBottom: '28px' }}>
                  {tier.features.map((f, fi) => (
                    <li key={fi} style={{
                      fontSize: '14px', lineHeight: 1.5, marginBottom: '10px',
                      color: tier.featured ? '#D4CCBF' : '#4A4641',
                      paddingLeft: '20px', position: 'relative',
                    }}>
                      <span style={{
                        position: 'absolute', left: 0,
                        color: '#A8482A',
                      }}>→</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button className="cta-button" style={{
                  width: '100%', padding: '12px 20px', borderRadius: '999px',
                  fontSize: '14px', fontWeight: 500,
                  backgroundColor: tier.featured ? '#F5F0E8' : '#1D1B1A',
                  color: tier.featured ? '#1D1B1A' : '#F5F0E8',
                }}>
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT TILE */}
      <section id="contact" style={{
        padding: '120px 22px', textAlign: 'center',
      }}>
        <div className="mono" style={{
          fontSize: '12px', color: '#A8482A', letterSpacing: '0.1em',
          marginBottom: '24px',
        }}>
          {t.contact.eyebrow}
        </div>
        <h2 className="fraunces" style={{
          fontSize: 'clamp(40px, 6vw, 88px)', fontWeight: 500,
          lineHeight: 1, letterSpacing: '-0.03em',
          marginBottom: '40px', maxWidth: '900px', margin: '0 auto 40px',
        }}>
          {t.contact.h2a} <span style={{ fontStyle: 'italic' }}>{t.contact.h2b}</span>
        </h2>

        <a href="mailto:hello@colleagueai.ai" className="cta-button" style={{
          display: 'inline-block', padding: '16px 32px',
          backgroundColor: '#1D1B1A', color: '#F5F0E8',
          borderRadius: '999px', fontSize: '16px', fontWeight: 500,
        }}>
          hello@colleagueai.ai →
        </a>
      </section>

      {/* FOOTER */}
      <footer style={{
        padding: '40px 22px', borderTop: '1px solid rgba(29, 27, 26, 0.08)',
      }}>
        <div style={{
          maxWidth: '1024px', margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '12px', color: '#6B655E', flexWrap: 'wrap', gap: '20px',
        }}>
          <div className="mono">© 2026 COLLEAGUE AI · PRAHA, CZ</div>
          <div style={{ fontSize: '14px' }}>
            <span style={{ color: '#1D1B1A' }}>colleague</span>
            <span style={{ color: '#A8482A' }}>ai</span>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <a href="#" className="link-hover">{t.footer.privacy}</a>
            <a href="#" className="link-hover">{t.footer.terms}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const en = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Philosophy', pricing: 'Pricing', contact: 'Contact' },
  hero: {
    eyebrow: 'INTRODUCING THE COLLEAGUE AI MARKETPLACE',
    h1a: 'AI agents you can',
    h1b: 'actually deploy.',
    sub: 'Certified, audit-ready AI colleagues for finance, compliance, and operations. Built to work. Built to be trusted.',
    cta1: 'Browse the marketplace',
    cta2: 'Learn about CAI Score',
    stats: [
      { num: '15+', label: 'AGENTS IN PRODUCTION' },
      { num: '4', label: 'DOMAINS COVERED' },
      { num: '100%', label: 'AUDIT-READY' },
    ],
  },
  trustTile: {
    eyebrow: 'THE TRUST LAYER',
    h2a: 'The CAI Score.',
    h2b: 'The FICO of AI.',
    sub: 'Every agent we ship comes with a certified risk score, audit trail, and the documentation enterprises need to deploy with confidence.',
    scoreTitle: 'Finance Reconciliation Agent',
    scoreSub: 'Certified for production · Risk Level 2',
    metrics: [
      { label: 'CONTROLS', value: '42 / 42' },
      { label: 'AUDIT TRAIL', value: 'Full' },
      { label: 'INSURANCE', value: 'E&O Ready' },
    ],
    cta: 'How CAI Score works',
  },
  market: {
    eyebrow: 'THE MARKETPLACE',
    h2a: 'Production-tested',
    h2b: 'AI colleagues.',
    sub: 'Browse our library of certified AI agents. Each one ships with full documentation, risk classification, and audit-ready controls.',
    filters: [
      { id: 'all', label: 'All Agents' },
      { id: 'finance', label: 'Finance' },
      { id: 'sap', label: 'SAP Master Data' },
      { id: 'legal', label: 'Legal & Entity' },
      { id: 'compliance', label: 'Compliance' },
    ],
    viewDetails: 'View details',
  },
  agents: [
    { name: 'Month-End Close', category: 'finance', icon: '◐', color: '#FFE8DC', score: 'A', risk: 'L2', desc: 'Automates the full month-end close cycle: accruals, reconciliations, and reporting with built-in approvals.', deployments: '8 DEPLOYMENTS', scoreColor: '#A8482A' },
    { name: 'AR Reconciliation', category: 'finance', icon: '◑', color: '#FFE8DC', score: 'A', risk: 'L2', desc: 'Matches invoices, payments, and remittances across systems. Flags exceptions for human review.', deployments: '5 DEPLOYMENTS', scoreColor: '#A8482A' },
    { name: 'Vendor Master Data', category: 'sap', icon: '▣', color: '#E8E4DC', score: 'A+', risk: 'L1', desc: 'Creates, validates, and maintains SAP vendor master records with KYC and duplicate detection.', deployments: '6 DEPLOYMENTS', scoreColor: '#1D1B1A' },
    { name: 'Material Master', category: 'sap', icon: '▤', color: '#E8E4DC', score: 'A', risk: 'L2', desc: 'Manages SAP material master with classification, pricing, and cross-plant consistency checks.', deployments: '4 DEPLOYMENTS', scoreColor: '#A8482A' },
    { name: 'Entity Hierarchy', category: 'legal', icon: '◇', color: '#DCE4E8', score: 'A', risk: 'L3', desc: 'Maintains legal entity hierarchies, ownership chains, and corporate governance records.', deployments: '3 DEPLOYMENTS', scoreColor: '#A8482A' },
    { name: 'KYC Workflow', category: 'legal', icon: '◈', color: '#DCE4E8', score: 'A+', risk: 'L2', desc: 'End-to-end KYC for new business relationships. Documentation-ready for regulators.', deployments: '4 DEPLOYMENTS', scoreColor: '#1D1B1A' },
    { name: 'EU AI Act Compliance', category: 'compliance', icon: '◆', color: '#E8DCE4', score: 'A+', risk: 'L1', desc: 'Maps your AI systems to EU AI Act risk categories. Generates required documentation automatically.', deployments: '2 DEPLOYMENTS', scoreColor: '#1D1B1A' },
    { name: 'GDPR DPIA Generator', category: 'compliance', icon: '◊', color: '#E8DCE4', score: 'A', risk: 'L2', desc: 'Produces Data Protection Impact Assessments with full audit trail and DPO sign-off workflow.', deployments: '3 DEPLOYMENTS', scoreColor: '#A8482A' },
  ],
  phil: {
    eyebrow: 'OUR PHILOSOPHY',
    quote: "If a use case shouldn't be automated, we say so. If a client wants speed over safety in a regulated process, we walk. The trust we're building is worth more than any single deal.",
    attr: 'COLLEAGUE AI · OPERATING PRINCIPLE',
  },
  price: {
    eyebrow: 'PRICING',
    h2a: 'Choose your',
    h2b: 'starting point.',
    popular: 'MOST POPULAR',
    tiers: [
      {
        tag: 'STARTER', name: 'Starter', price: '€2,400', period: '/month',
        features: ['1 certified agent', 'L1–L2 risk only', 'Standard support', 'Quarterly review'],
        cta: 'Get started',
      },
      {
        tag: 'BUSINESS', name: 'Business', price: '€8,500', period: '/month', featured: true,
        features: ['Up to 5 agents', 'L1–L3 risk coverage', 'CAI Score certification', 'E&O insurance bundle', 'Priority support'],
        cta: 'Talk to sales',
      },
      {
        tag: 'ENTERPRISE', name: 'Enterprise', price: 'Custom', period: '',
        features: ['Unlimited agents', 'L1–L5 risk coverage', 'White-label option', 'Dedicated team', 'Big 4 methodology'],
        cta: 'Contact us',
      },
    ],
  },
  contact: {
    eyebrow: 'GET IN TOUCH',
    h2a: 'Ready to deploy',
    h2b: 'AI you can defend?',
  },
  footer: { privacy: 'Privacy', terms: 'Terms' },
};

const cs = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Filozofie', pricing: 'Ceník', contact: 'Kontakt' },
  hero: {
    eyebrow: 'PŘEDSTAVUJEME COLLEAGUE AI MARKETPLACE',
    h1a: 'AI agenti, které lze',
    h1b: 'skutečně nasadit.',
    sub: 'Certifikovaní AI kolegové pro finance, compliance a provoz. Připraveni na produkci. Připraveni na audit.',
    cta1: 'Prohlédnout marketplace',
    cta2: 'Více o CAI Score',
    stats: [
      { num: '15+', label: 'AGENTŮ V PRODUKCI' },
      { num: '4', label: 'POKRYTÉ DOMÉNY' },
      { num: '100%', label: 'PŘIPRAVENO NA AUDIT' },
    ],
  },
  trustTile: {
    eyebrow: 'VRSTVA DŮVĚRY',
    h2a: 'CAI Score.',
    h2b: 'FICO pro AI.',
    sub: 'Každý agent, kterého dodáme, přichází s certifikovaným rizikovým skóre, audit trailem a dokumentací, kterou podnik potřebuje k bezpečnému nasazení.',
    scoreTitle: 'Agent pro rekonciliaci financí',
    scoreSub: 'Certifikováno pro produkci · Riziko L2',
    metrics: [
      { label: 'KONTROLY', value: '42 / 42' },
      { label: 'AUDIT TRAIL', value: 'Plný' },
      { label: 'POJIŠTĚNÍ', value: 'E&O Ready' },
    ],
    cta: 'Jak funguje CAI Score',
  },
  market: {
    eyebrow: 'MARKETPLACE',
    h2a: 'Produkčně ověření',
    h2b: 'AI kolegové.',
    sub: 'Procházejte naši knihovnu certifikovaných AI agentů. Každý je dodáván s plnou dokumentací, klasifikací rizika a audit-ready kontrolami.',
    filters: [
      { id: 'all', label: 'Všichni agenti' },
      { id: 'finance', label: 'Finance' },
      { id: 'sap', label: 'SAP kmenová data' },
      { id: 'legal', label: 'Právní a entity' },
      { id: 'compliance', label: 'Compliance' },
    ],
    viewDetails: 'Detaily',
  },
  agents: [
    { name: 'Měsíční uzávěrka', category: 'finance', icon: '◐', color: '#FFE8DC', score: 'A', risk: 'L2', desc: 'Automatizuje celý cyklus měsíční uzávěrky: časové rozlišení, rekonciliace a reporting s integrovaným schvalováním.', deployments: '8 NASAZENÍ', scoreColor: '#A8482A' },
    { name: 'AR rekonciliace', category: 'finance', icon: '◑', color: '#FFE8DC', score: 'A', risk: 'L2', desc: 'Páruje faktury, platby a remitance napříč systémy. Označuje výjimky pro lidskou kontrolu.', deployments: '5 NASAZENÍ', scoreColor: '#A8482A' },
    { name: 'Vendor Master Data', category: 'sap', icon: '▣', color: '#E8E4DC', score: 'A+', risk: 'L1', desc: 'Vytváří, validuje a udržuje záznamy SAP vendor master s KYC a detekcí duplicit.', deployments: '6 NASAZENÍ', scoreColor: '#1D1B1A' },
    { name: 'Material Master', category: 'sap', icon: '▤', color: '#E8E4DC', score: 'A', risk: 'L2', desc: 'Spravuje SAP material master s klasifikací, ceníky a kontrolami konzistence napříč závody.', deployments: '4 NASAZENÍ', scoreColor: '#A8482A' },
    { name: 'Hierarchie entit', category: 'legal', icon: '◇', color: '#DCE4E8', score: 'A', risk: 'L3', desc: 'Udržuje hierarchie právních entit, vlastnické řetězce a záznamy korporátní governance.', deployments: '3 NASAZENÍ', scoreColor: '#A8482A' },
    { name: 'KYC workflow', category: 'legal', icon: '◈', color: '#DCE4E8', score: 'A+', risk: 'L2', desc: 'End-to-end KYC pro nové obchodní vztahy. Dokumentace připravená pro regulátora.', deployments: '4 NASAZENÍ', scoreColor: '#1D1B1A' },
    { name: 'EU AI Act compliance', category: 'compliance', icon: '◆', color: '#E8DCE4', score: 'A+', risk: 'L1', desc: 'Mapuje vaše AI systémy do rizikových kategorií EU AI Act. Automaticky generuje povinnou dokumentaci.', deployments: '2 NASAZENÍ', scoreColor: '#1D1B1A' },
    { name: 'GDPR DPIA generátor', category: 'compliance', icon: '◊', color: '#E8DCE4', score: 'A', risk: 'L2', desc: 'Vytváří Posouzení vlivu na ochranu osobních údajů s plným audit trailem a workflow pro DPO.', deployments: '3 NASAZENÍ', scoreColor: '#A8482A' },
  ],
  phil: {
    eyebrow: 'NAŠE FILOZOFIE',
    quote: 'Pokud něco automatizovat nelze nebo by se nemělo, řekneme to. Pokud klient požaduje rychlost před bezpečností v regulovaném procesu, odejdeme. Důvěra, kterou budujeme, má větší hodnotu než jakákoli jednotlivá zakázka.',
    attr: 'COLLEAGUE AI · PROVOZNÍ PRINCIP',
  },
  price: {
    eyebrow: 'CENÍK',
    h2a: 'Zvolte si',
    h2b: 'svůj start.',
    popular: 'NEJOBLÍBENĚJŠÍ',
    tiers: [
      {
        tag: 'STARTER', name: 'Starter', price: '€2 400', period: '/měsíc',
        features: ['1 certifikovaný agent', 'Pouze riziko L1–L2', 'Standardní podpora', 'Kvartální revize'],
        cta: 'Začít',
      },
      {
        tag: 'BUSINESS', name: 'Business', price: '€8 500', period: '/měsíc', featured: true,
        features: ['Až 5 agentů', 'Pokrytí rizika L1–L3', 'CAI Score certifikace', 'E&O pojištění v ceně', 'Prioritní podpora'],
        cta: 'Mluvit s obchodem',
      },
      {
        tag: 'ENTERPRISE', name: 'Enterprise', price: 'Na míru', period: '',
        features: ['Neomezený počet agentů', 'Pokrytí rizika L1–L5', 'White-label varianta', 'Dedikovaný tým', 'Big 4 metodologie'],
        cta: 'Kontaktovat',
      },
    ],
  },
  contact: {
    eyebrow: 'NAPIŠTE NÁM',
    h2a: 'Připraveni nasadit',
    h2b: 'AI, kterou obhájíte?',
  },
  footer: { privacy: 'Soukromí', terms: 'Podmínky' },
};

const de = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Philosophie', pricing: 'Preise', contact: 'Kontakt' },
  hero: {
    eyebrow: 'DER COLLEAGUE AI MARKETPLACE',
    h1a: 'KI-Agenten, die Sie',
    h1b: 'wirklich einsetzen können.',
    sub: 'Zertifizierte, prüfbereite KI-Kollegen für Finanzen, Compliance und Betrieb.',
    cta1: 'Marketplace erkunden',
    cta2: 'Mehr über CAI Score',
    stats: [
      { num: '15+', label: 'AGENTEN IN PRODUKTION' },
      { num: '4', label: 'ABGEDECKTE BEREICHE' },
      { num: '100%', label: 'AUDIT-BEREIT' },
    ],
  },
  trustTile: en.trustTile,
  market: { ...en.market, filters: en.market.filters },
  agents: en.agents,
  phil: en.phil,
  price: en.price,
  contact: { eyebrow: 'KONTAKT', h2a: 'Bereit für', h2b: 'vertrauenswürdige KI?' },
  footer: { privacy: 'Datenschutz', terms: 'AGB' },
};

const fr = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Philosophie', pricing: 'Tarifs', contact: 'Contact' },
  hero: {
    eyebrow: 'LE MARKETPLACE COLLEAGUE AI',
    h1a: 'Des agents IA que vous pouvez',
    h1b: 'vraiment déployer.',
    sub: 'Des collègues IA certifiés, audit-ready pour la finance, la conformité et les opérations.',
    cta1: 'Explorer le marketplace',
    cta2: 'En savoir plus sur CAI Score',
    stats: [
      { num: '15+', label: 'AGENTS EN PRODUCTION' },
      { num: '4', label: 'DOMAINES COUVERTS' },
      { num: '100%', label: 'AUDIT-READY' },
    ],
  },
  trustTile: en.trustTile,
  market: en.market,
  agents: en.agents,
  phil: en.phil,
  price: en.price,
  contact: { eyebrow: 'NOUS CONTACTER', h2a: 'Prêt à déployer', h2b: "une IA que vous pouvez défendre ?" },
  footer: { privacy: 'Confidentialité', terms: 'CGU' },
};

const es = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Filosofía', pricing: 'Precios', contact: 'Contacto' },
  hero: {
    eyebrow: 'EL MARKETPLACE DE COLLEAGUE AI',
    h1a: 'Agentes de IA que puede',
    h1b: 'realmente desplegar.',
    sub: 'Colegas de IA certificados y listos para auditoría en finanzas, cumplimiento y operaciones.',
    cta1: 'Explorar el marketplace',
    cta2: 'Más sobre CAI Score',
    stats: [
      { num: '15+', label: 'AGENTES EN PRODUCCIÓN' },
      { num: '4', label: 'DOMINIOS CUBIERTOS' },
      { num: '100%', label: 'LISTOS PARA AUDITORÍA' },
    ],
  },
  trustTile: en.trustTile,
  market: en.market,
  agents: en.agents,
  phil: en.phil,
  price: en.price,
  contact: { eyebrow: 'CONTÁCTENOS', h2a: '¿Listo para desplegar', h2b: 'IA en la que puede confiar?' },
  footer: { privacy: 'Privacidad', terms: 'Términos' },
};

const it = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Filosofia', pricing: 'Prezzi', contact: 'Contatti' },
  hero: {
    eyebrow: 'IL MARKETPLACE DI COLLEAGUE AI',
    h1a: 'Agenti AI che puoi',
    h1b: 'davvero dispiegare.',
    sub: "Colleghi AI certificati e pronti per l'audit in finanza, compliance e operazioni.",
    cta1: 'Esplora il marketplace',
    cta2: 'Scopri il CAI Score',
    stats: [
      { num: '15+', label: 'AGENTI IN PRODUZIONE' },
      { num: '4', label: 'DOMINI COPERTI' },
      { num: '100%', label: 'PRONTI PER AUDIT' },
    ],
  },
  trustTile: en.trustTile,
  market: en.market,
  agents: en.agents,
  phil: en.phil,
  price: en.price,
  contact: { eyebrow: 'CONTATTACI', h2a: 'Pronti a dispiegare', h2b: 'AI di cui fidarsi?' },
  footer: { privacy: 'Privacy', terms: 'Termini' },
};

const pl = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Filozofia', pricing: 'Cennik', contact: 'Kontakt' },
  hero: {
    eyebrow: 'MARKETPLACE COLLEAGUE AI',
    h1a: 'Agenci AI, których możesz',
    h1b: 'faktycznie wdrożyć.',
    sub: 'Certyfikowani agenci AI gotowi na audyt w finansach, compliance i operacjach.',
    cta1: 'Przeglądaj marketplace',
    cta2: 'Dowiedz się o CAI Score',
    stats: [
      { num: '15+', label: 'AGENTÓW W PRODUKCJI' },
      { num: '4', label: 'OBSZARÓW' },
      { num: '100%', label: 'GOTOWYCH NA AUDYT' },
    ],
  },
  trustTile: en.trustTile,
  market: en.market,
  agents: en.agents,
  phil: en.phil,
  price: en.price,
  contact: { eyebrow: 'SKONTAKTUJ SIĘ', h2a: 'Gotowy na wdrożenie', h2b: 'godnego zaufania AI?' },
  footer: { privacy: 'Prywatność', terms: 'Warunki' },
};

const sk = {
  nav: { marketplace: 'Marketplace', trust: 'CAI Score', philosophy: 'Filozofia', pricing: 'Cenník', contact: 'Kontakt' },
  hero: {
    eyebrow: 'MARKETPLACE COLLEAGUE AI',
    h1a: 'AI agenti, ktorých môžete',
    h1b: 'skutočne nasadiť.',
    sub: 'Certifikovaní AI kolegovia pre financie, compliance a prevádzku. Pripravení na audit.',
    cta1: 'Prehliadať marketplace',
    cta2: 'Viac o CAI Score',
    stats: [
      { num: '15+', label: 'AGENTOV V PRODUKCII' },
      { num: '4', label: 'POKRYTÉ OBLASTI' },
      { num: '100%', label: 'PRIPRAVENÍ NA AUDIT' },
    ],
  },
  trustTile: en.trustTile,
  market: en.market,
  agents: en.agents,
  phil: en.phil,
  price: en.price,
  contact: { eyebrow: 'KONTAKTUJTE NÁS', h2a: 'Pripravení nasadiť', h2b: 'AI, ktorej môžete veriť?' },
  footer: { privacy: 'Ochrana súkromia', terms: 'Podmienky' },
};

const translations = { en, cs, de, fr, es, it, pl, sk };

