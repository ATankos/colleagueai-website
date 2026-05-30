import { useState } from 'react';

const S = {
  page: {
    minHeight: '100vh',
    background: '#F5EFE3',
    fontFamily: "'Geist', system-ui, -apple-system, sans-serif",
    color: '#1F1B17',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 32px',
    borderBottom: '1px solid #1F1B1722',
  },
  logo: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '20px',
    fontWeight: 700,
    color: '#1F1B17',
    textDecoration: 'none',
  },
  backLink: {
    fontSize: '14px',
    color: '#C7522A',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  hero: {
    maxWidth: '780px',
    margin: '0 auto',
    padding: '56px 24px 0',
    textAlign: 'center',
  },
  badge: {
    display: 'inline-block',
    background: '#C7522A18',
    color: '#C7522A',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '4px 12px',
    borderRadius: '999px',
    marginBottom: '20px',
  },
  h1: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: 'clamp(32px, 5vw, 52px)',
    fontWeight: 700,
    lineHeight: 1.05,
    margin: '0 0 16px',
    color: '#1F1B17',
  },
  sub: {
    fontSize: '17px',
    color: '#7A7062',
    lineHeight: 1.6,
    maxWidth: '560px',
    margin: '0 auto 8px',
  },
  demoNote: {
    fontSize: '13px',
    color: '#A89F8E',
    marginBottom: '40px',
  },
  card: {
    background: '#fff',
    border: '1px solid #1F1B1722',
    borderRadius: '20px',
    padding: '32px',
    maxWidth: '640px',
    margin: '0 auto 48px',
    boxShadow: '0 4px 24px #1F1B1710',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#4A4239',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    border: '1px solid #1F1B1722',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '15px',
    background: '#FAF6EC',
    color: '#1F1B17',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    border: '1px solid #1F1B1722',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '15px',
    background: '#FAF6EC',
    color: '#1F1B17',
    minHeight: '80px',
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  btn: {
    width: '100%',
    padding: '14px',
    background: '#C7522A',
    color: '#fff',
    border: 0,
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '8px',
    fontFamily: 'inherit',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  resultCard: {
    background: '#FAF6EC',
    border: '1px solid #1F1B1714',
    borderRadius: '14px',
    padding: '18px',
    marginTop: '16px',
    textAlign: 'left',
  },
  airline: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '18px',
    fontWeight: 700,
    color: '#1F1B17',
    marginBottom: '4px',
  },
  meta: {
    fontSize: '13px',
    color: '#7A7062',
    marginBottom: '8px',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  price: {
    fontWeight: 700,
    fontSize: '16px',
    color: '#1F1B17',
  },
  score: {
    background: '#C7522A',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 700,
    padding: '2px 10px',
    borderRadius: '999px',
  },
  reason: {
    fontSize: '14px',
    color: '#4A4239',
    lineHeight: 1.5,
  },
  error: {
    color: '#C7522A',
    fontSize: '14px',
    marginTop: '12px',
    textAlign: 'center',
  },
};

export default function Demo() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults([]);

    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());

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
    <div style={S.page}>
      <nav style={S.nav}>
        <a href="/" style={S.logo}>Colleague AI</a>
        <a href="/" style={S.backLink}>← Back to site</a>
      </nav>

      <div style={S.hero}>
        <div style={S.badge}>Live Agent Demo</div>
        <h1 style={S.h1}>Watch the agent reason<br />about your flight.</h1>
        <p style={S.sub}>
          Fill in your travel details and preferences. The agent analyses mock flight options and explains its recommendations — the same reasoning logic we embed in enterprise workflows.
        </p>
        <p style={S.demoNote}>Mock data · For demonstration only · Not a booking tool</p>
      </div>

      <div style={S.card}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>From</label>
              <input name="origin" placeholder="ZRH" defaultValue="ZRH" required style={S.input} />
            </div>
            <div>
              <label style={S.label}>To</label>
              <input name="destination" placeholder="YYZ" defaultValue="YYZ" required style={S.input} />
            </div>
          </div>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>Departure date</label>
              <input name="departureDate" type="date" required style={S.input} />
            </div>
            <div>
              <label style={S.label}>Passengers</label>
              <input name="adults" type="number" min="1" defaultValue="1" required style={S.input} />
            </div>
          </div>

          <div style={S.grid2}>
            <div>
              <label style={S.label}>Cabin</label>
              <select name="cabin" style={S.input}>
                <option value="ECONOMY">Economy</option>
                <option value="PREMIUM_ECONOMY">Premium Economy</option>
                <option value="BUSINESS">Business</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Max stops</label>
              <select name="maxStops" style={S.input}>
                <option value="1">Max 1 stop</option>
                <option value="0">Direct only</option>
                <option value="2">Max 2 stops</option>
              </select>
            </div>
          </div>

          <div>
            <label style={S.label}>Your preferences</label>
            <textarea
              name="preferences"
              defaultValue="Cheapest option, but avoid overnight layovers and very short connections."
              style={S.textarea}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}
          >
            {loading ? 'Agent is reasoning…' : 'Find best flights →'}
          </button>
        </form>

        {error && <p style={S.error}>{error}</p>}

        {results.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <p style={{ fontSize: '13px', color: '#A89F8E', marginBottom: '4px' }}>
              Agent ranked {results.length} options based on your preferences:
            </p>
            {results.map((r, i) => (
              <div key={i} style={S.resultCard}>
                <div style={S.airline}>{r.airline}</div>
                <div style={S.meta}>
                  {r.route} · {r.departure} → {r.arrival} · {r.duration} · {r.stops} stop(s)
                </div>
                <div style={S.priceRow}>
                  <span style={S.price}>{r.price}</span>
                  <span style={S.score}>Score {r.score}/100</span>
                </div>
                <p style={S.reason}>{r.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
