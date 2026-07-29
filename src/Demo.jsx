/**
 * Demo.jsx — placeholder for the /demo route.
 *
 * The previous content was an "AI Flight Advisor" travel-booking demo with a
 * desktop-app download. It did not represent the governed enterprise product and
 * has been removed. Every "Book a demo" CTA on the site points here, so the route
 * must keep working: this page routes the visitor to a real conversation instead.
 *
 * To publish a recorded walkthrough later, drop the embed into the panel marked
 * below and remove the placeholder note.
 */
const C = {
  cream: '#F5F0E8', paper: '#FBF8F2', graphite: '#2B2A28',
  terra: '#C65D3A', line: '#E2D9CB', soft: '#4A4641', muted: '#8A857C',
};
const serif = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const sans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export default function Demo() {
  return (
    <div style={{ background: C.cream, color: C.graphite, fontFamily: sans, minHeight: '100vh', lineHeight: 1.6 }}>
      <style>{`
        *{box-sizing:border-box}
        body{margin:0}
        .d-wrap{max-width:820px;margin:0 auto;padding:0 22px}
        .d-hdr{background:rgba(34,33,31,.97);position:sticky;top:0;z-index:50}
        .d-hdr-in{display:flex;align-items:center;justify-content:space-between;height:70px}
        .d-logo{display:inline-flex;flex-direction:column;gap:4px;line-height:1;text-decoration:none}
        .d-logo-t{font-family:${serif};font-size:22px;font-weight:600;color:${C.cream}}
        .d-logo-t span{color:#E8A07F}
        .d-dots{display:flex;gap:5px}
        .d-dots span{width:5px;height:5px;border-radius:50%;display:block}
        .d-back{color:#CFC8BB;font-size:14px;text-decoration:none}
        .d-back:hover{color:#fff}
        h1{font-family:${serif};font-weight:500;font-size:clamp(28px,6vw,44px);line-height:1.15;letter-spacing:-.02em;margin:0 0 16px}
        .d-kicker{font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};display:block;margin-bottom:14px}
        .d-sub{font-size:17px;color:${C.soft};margin:0 0 26px}
        .d-panel{background:${C.paper};border:1px solid ${C.line};border-radius:16px;padding:26px;margin:30px 0}
        .d-panel h2{font-family:${serif};font-weight:500;font-size:20px;margin:0 0 10px}
        .d-panel p{font-size:15px;color:${C.soft};margin:0}
        .d-btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
        .d-btn{display:inline-block;padding:13px 26px;border-radius:100px;font-weight:600;font-size:15px;text-decoration:none;border:1px solid transparent}
        .d-p{background:${C.terra};color:#fff}
        .d-s{border-color:${C.graphite};color:${C.graphite}}
        .d-s:hover{background:${C.graphite};color:${C.cream}}
        .d-list{list-style:none;padding:0;margin:18px 0 0}
        .d-list li{font-size:15px;color:${C.soft};padding:9px 0;border-top:1px solid ${C.line}}
        .d-list li::before{content:"— ";color:${C.terra}}
        a:focus-visible,.d-btn:focus-visible{outline:2px solid ${C.terra};outline-offset:2px}
        @media (max-width:560px){.d-btn{width:100%;text-align:center}}
        @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
      `}</style>

      <header className="d-hdr">
        <div className="d-wrap d-hdr-in">
          <a className="d-logo" href="/" aria-label="Colleague AI home">
            <span className="d-logo-t">Colleague<span>AI</span></span>
            <span className="d-dots" aria-hidden="true">
              <span style={{ background: C.terra }} /><span style={{ background: C.cream }} /><span style={{ background: C.muted }} />
            </span>
          </a>
          <a className="d-back" href="/">← Back to site</a>
        </div>
      </header>

      <main className="d-wrap" style={{ padding: '64px 22px 72px' }}>
        <span className="d-kicker">Enterprise demo</span>
        <h1>See a governed agent on your own workflow.</h1>
        <p className="d-sub">
          Demos are run with our team against a workflow you choose, so you see the approval
          points, the audit trail and the controls that would apply in your environment,
          rather than a generic sandbox.
        </p>

        <div className="d-btns">
          <a className="d-btn d-p" href="/contact">Request a demo</a>
          <a className="d-btn d-s" href="/pricing">See pricing</a>
        </div>

        {/* RECORDED WALKTHROUGH — drop a YouTube/Vimeo/Loom embed here when one exists. */}
        <div className="d-panel">
          <h2>A recorded walkthrough is not published yet</h2>
          <p>
            We would rather show a governed workflow properly than post a scripted clip.
            Ask us for a live session and we will match it to your industry.
          </p>
        </div>

        <h2 style={{ fontFamily: serif, fontWeight: 500, fontSize: 20, margin: '34px 0 0' }}>What a session covers</h2>
        <ul className="d-list">
          <li>One workflow you nominate, walked end to end</li>
          <li>Where the agent acts, and where a named human approves</li>
          <li>The evidence produced for later review</li>
          <li>How it would run inside your own environment</li>
          <li>An indicative scope and price range for that use case</li>
        </ul>

        <div className="d-btns" style={{ marginTop: 30 }}>
          <a className="d-btn d-p" href="/contact">Request a demo</a>
          <a className="d-btn d-s" href="/agents">Browse the catalogue</a>
        </div>
      </main>
    </div>
  );
}
