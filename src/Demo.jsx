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

export default function Demo() {
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
        <span className="d-kicker">Demo</span>
        <h1>Coming soon.</h1>
        <p className="d-sub">
          The online demo is not published yet. In the meantime, contact us and we
          will walk you through a governed agent on a workflow you choose.
        </p>
        <div className="d-btns">
          <a className="d-btn d-p" href="/contact">Contact us</a>
          <a className="d-btn d-s" href="/agents">Browse the catalogue</a>
        </div>
      </main>
    </div>
  );
}
