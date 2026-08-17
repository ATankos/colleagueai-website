/* generate-partner-levels.cjs — inject the three-level partner programme
   (levels, contribution table, worked example, programme terms) into every
   localized partner page. Idempotent: the block is replaced, never duplicated.
   Commission percentages and USD values are never localized. */
const fs = require("fs");
const { DEFAULT_LOCALE, SUPPORTED_LOCALE_CODES } = require("./i18n/config.cjs");
const DICT = fs.existsSync(__dirname + "/i18n/partner-content.json")
  ? require("./i18n/partner-content.json") : {};
const KEYS = Object.keys(DICT).sort((a, b) => b.length - a.length);

const T = (s, loc) => (loc === DEFAULT_LOCALE ? s : ((DICT[s] && DICT[s][loc]) || s));

const C = {
  eyebrow: "Partner network",
  h2: "Three ways to partner.",
  lead: "Introduce enterprise customers, participate in the sales process or develop a strategic market partnership. Our partner model rewards measurable contribution to customer acquisition and delivery.",
  commission: "Commission",
  youDo: "You do",
  weDo: "ColleagueAI does",
  typical: "Typical activities",
  potential: "Potential activities",
  levels: [
    { id: "referral", name: "Referral Partner", rate: "10%",
      desc: "For partners who identify and introduce qualified prospective customers.",
      doLabel: "You do",
      items: ["Identify a relevant prospective customer", "Make a documented introduction", "Provide sufficient context for qualification", "Allow ColleagueAI to manage the commercial process"],
      weDo: "Discovery, demonstration, proposal, negotiation, contracting, implementation and customer support.",
      cta: "Become a Referral Partner", href: "#partner-apply" },
    { id: "sales", name: "Sales Partner", rate: "15%",
      desc: "For partners who actively qualify opportunities and participate in progressing the commercial relationship.",
      doLabel: "Typical activities",
      items: ["Qualifying customer needs", "Arranging meetings", "Supporting presentations", "Maintaining stakeholder engagement", "Assisting with commercial follow-up", "Helping move the opportunity toward a decision"],
      weDo: "", cta: "Become a Sales Partner", href: "#partner-apply" },
    { id: "strategic", name: "Strategic Partner", rate: "From 20%",
      desc: "For established partners who generate recurring opportunities, provide strategic market access or assume meaningful commercial and customer responsibilities.",
      doLabel: "Potential activities",
      items: ["Recurring pipeline generation", "Regional or industry market development", "Active sales ownership", "Account development", "Implementation coordination", "Initial customer support", "Joint go-to-market activities"],
      weDo: "", note: "Strategic-partner terms are agreed individually and may depend on volume, territory, responsibilities, support model and commercial commitment.",
      cta: "Discuss a Strategic Partnership", href: "CONTACT" }
  ],
  tableH: "Partner contribution and typical commission",
  colA: "Partner contribution", colB: "Typical commission",
  rows: [
    ["Qualified referral or introduction", "5%–10%"],
    ["Meeting arrangement and active sales support", "10%–15%"],
    ["Full presentation and commercial close", "15%–25%"],
    ["Authorized reseller with sales and initial support", "20%–35%"]
  ],
  tableNote: "Final commission terms depend on the partner's role, transaction size, discount level, customer responsibilities, territory and ongoing support obligations.",
  exH: "Example transaction",
  exRows: [
    ["Agent contract value", "$30,000"],
    ["Referral Partner commission at 10%", "$3,000"],
    ["Revenue retained by ColleagueAI before delivery costs and other expenses", "$27,000"]
  ],
  termsH: "Clear and transparent partner terms",
  terms: [
    "Commission is normally calculated from eligible net revenue.",
    "Commission becomes payable only after the customer's payment has been received.",
    "Taxes, refunds, credits, chargebacks and excluded pass-through costs may be deducted from the commission base.",
    "Every opportunity must be registered and accepted before commission protection begins.",
    "Referral protection applies for a defined contractual period.",
    "Existing customers and previously active opportunities may be excluded.",
    "The agreement must define responsibility where multiple partners claim the same opportunity.",
    "Renewal and expansion commissions apply only when explicitly included in the partner agreement.",
    "Strategic or reseller relationships may include additional customer-support and service obligations.",
    "Regional, industry or account exclusivity must be documented in writing.",
    "ColleagueAI may reject opportunities that do not meet qualification, compliance or commercial requirements."
  ],
  formH: "Apply to become a partner",
  formLead: "Tell us about your business and how you would work with ColleagueAI. Include the details below in your email. Applications are reviewed individually; approval and commission eligibility remain subject to a signed partner agreement.",
  ask: ["Your company, website and country", "The partner level you are interested in", "The industries and customer segments you work with", "Your typical customer reach", "Any existing technology partnerships"],
  emailCta: "Email hello@colleagueai.ai",
  f: {
    name: "Full name", email: "Work email", company: "Company", website: "Website",
    country: "Country or target market", type: "Partner type", industries: "Relevant industries",
    reach: "Estimated customer reach", desc: "Description of the proposed partnership",
    existing: "Existing technology or consulting partnerships", optional: "(optional)",
    select: "Select", submit: "Submit application",
    consent: "I have read and accept the privacy policy.", privacy: "Privacy policy",
    ok: "Thank you. Your application has been received and we will reply to your work email.",
    bad: "Something went wrong. Please try again, or email hello@colleagueai.ai.",
    eName: "Please enter your full name.", eEmail: "Please enter a valid work email address.",
    eCompany: "Please enter your company name."
  },
  disclaimer: "Commission percentages shown on this page are indicative program terms and do not create an entitlement to payment. All partnerships are subject to approval and a signed partner agreement."
};

const CSS = `<style id="cai-partner-levels-css">
#partner-levels{padding:64px 0}
#partner-levels .pl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:30px}
#partner-levels .pl-card{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:24px;display:flex;flex-direction:column}
#partner-levels .pl-card h3{font-family:ui-serif,Georgia,serif;font-weight:500;font-size:20px;margin-bottom:4px}
#partner-levels .pl-rate{font-size:26px;font-weight:700;color:var(--terra);letter-spacing:-.01em}
#partner-levels .pl-rate small{display:block;font-size:10.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-family:ui-monospace,Consolas,monospace}
#partner-levels .pl-desc{font-size:14.5px;color:var(--graphite-soft);margin:12px 0 14px}
#partner-levels .pl-lbl{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px}
#partner-levels .pl-card ul{list-style:none;margin:0 0 14px}
#partner-levels .pl-card li{font-size:13.5px;color:var(--graphite-soft);padding:5px 0;border-top:1px solid var(--line-soft)}
#partner-levels .pl-card li::before{content:"— ";color:var(--terra)}
#partner-levels .pl-we{font-size:13px;color:var(--graphite-soft);background:var(--cream-2);border-radius:10px;padding:10px 12px;margin-bottom:14px}
#partner-levels .pl-note{font-size:12.5px;color:var(--muted);margin-bottom:14px}
#partner-levels .pl-cta{margin-top:auto}
#partner-levels .pl-tablewrap{overflow-x:auto;margin-top:18px;-webkit-overflow-scrolling:touch}
#partner-levels table{width:100%;border-collapse:collapse;min-width:460px}
#partner-levels th,#partner-levels td{text-align:left;font-size:14px;padding:12px 14px;border-bottom:1px solid var(--line)}
#partner-levels th{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:500}
#partner-levels td:last-child,#partner-levels th:last-child{text-align:right;white-space:nowrap}
#partner-levels .pl-ex{background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:22px;margin-top:26px;max-width:620px}
#partner-levels .pl-ex .r{display:flex;justify-content:space-between;gap:18px;font-size:14.5px;padding:9px 0;border-top:1px solid var(--line-soft)}
#partner-levels .pl-ex .r:first-of-type{border-top:0}
#partner-levels .pl-ex .r b{white-space:nowrap}
#partner-levels .pl-terms{margin-top:30px;max-width:900px}
#partner-levels .pl-terms ul{list-style:none;margin-top:12px}
#partner-levels .pl-terms li{font-size:14px;color:var(--graphite-soft);padding:8px 0;border-bottom:1px solid var(--line-soft)}
#partner-levels .pl-terms li::before{content:"·  ";color:var(--terra);font-weight:700}
#partner-levels .pl-disc{font-size:12.5px;color:var(--muted);margin-top:16px;border-left:3px solid var(--line);padding-left:14px}
#partner-levels .pl-small{font-size:12.5px;color:var(--muted);margin-top:12px}
#partner-levels .pl-form{margin-top:38px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);padding:26px;max-width:900px}
#partner-levels .pl-formlead{font-size:15px;color:var(--graphite-soft);margin-top:10px;max-width:70ch}
#partner-levels .pl-ask{list-style:none;padding:0;margin:20px 0 0;max-width:70ch}
#partner-levels .pl-ask li{font-size:14.5px;color:var(--graphite-soft);padding:8px 0;border-bottom:1px solid var(--line)}
#partner-levels .pl-ask li::before{content:"→ ";color:var(--terra);font-weight:700}
#partner-levels .pl-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
@media (max-width:680px){#partner-levels .pl-fgrid{grid-template-columns:1fr}}
#partner-levels .pl-full{grid-column:1/-1}
#partner-levels .fld label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--graphite)}
#partner-levels .fld .opt{font-weight:400;color:var(--muted)}
#partner-levels .fld input,#partner-levels .fld select,#partner-levels .fld textarea{width:100%;font:inherit;font-size:15px;color:var(--graphite);background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px}
#partner-levels .fld textarea{min-height:104px;resize:vertical}
#partner-levels .fld input:focus-visible,#partner-levels .fld select:focus-visible,#partner-levels .fld textarea:focus-visible{outline:2px solid var(--terra);outline-offset:1px;border-color:var(--terra)}
#partner-levels .fld.bad input,#partner-levels .fld.bad textarea{border-color:#B3402A}
#partner-levels .fld .err{display:none;font-size:12.5px;color:#B3402A;margin-top:5px}
#partner-levels .fld.bad .err{display:block}
#partner-levels .pl-consent{display:flex;gap:10px;align-items:flex-start;margin-top:20px;font-size:14px;color:var(--graphite-soft)}
#partner-levels .pl-consent input{width:18px;height:18px;margin-top:2px;flex:0 0 auto}
#partner-levels .pl-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
#partner-levels .pl-msg{font-size:14.5px;border-radius:10px;padding:13px 16px;margin-top:18px;display:none}
#partner-levels .pl-msg.ok{display:block;background:#EDF3EC;border:1px solid #BFD6BB;color:#2C4A2A}
#partner-levels .pl-msg.bad{display:block;background:#F8ECE8;border:1px solid #E0BCB0;color:#8A3A24}
#partner-levels button.btn-p{cursor:pointer;font-family:inherit;border:0}
#partner-levels button.btn-p[disabled]{opacity:.55;cursor:not-allowed}
@media (prefers-reduced-motion:reduce){#partner-levels *{transition:none!important;animation:none!important}}
</style>`;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function build(loc, contactHref) {
  const t = (s) => esc(T(s, loc));
  const cards = C.levels.map((l) => {
    const href = l.href === "CONTACT" ? contactHref : l.href;
    return `<article class="pl-card" data-partner-level="${l.id}" data-partner-level-name="${esc(l.name)}">
<h3>${t(l.name)}</h3>
<div class="pl-rate">${esc(l.rate === "From 20%" ? T("From 20%", loc) : l.rate)}<small>${t(C.commission)}</small></div>
<p class="pl-desc">${t(l.desc)}</p>
<span class="pl-lbl">${t(l.doLabel)}</span>
<ul>${l.items.map((i) => `<li>${t(i)}</li>`).join("")}</ul>
${l.weDo ? `<div class="pl-we"><span class="pl-lbl">${t(C.weDo)}</span>${t(l.weDo)}</div>` : ""}
${l.note ? `<p class="pl-note">${t(l.note)}</p>` : ""}
<div class="pl-cta"><a class="btn-s" href="${href}" data-partner-cta="${l.id}">${t(l.cta)}</a></div>
</article>`;
  }).join("\n");

  return `${CSS}
<section id="partner-levels" aria-labelledby="partner-levels-h">
  <div class="wrap">
    <span class="eyebrow">${t(C.eyebrow)}</span>
    <h2 class="sec-h" id="partner-levels-h">${t(C.h2)}</h2>
    <p style="font-size:17px;color:var(--graphite-soft);margin-top:16px;max-width:60ch;line-height:1.55">${t(C.lead)}</p>
    <div class="pl-grid">
${cards}
    </div>

    <h3 class="pl-lbl" style="margin-top:40px;font-size:11.5px">${t(C.tableH)}</h3>
    <div class="pl-tablewrap" role="region" aria-label="${t(C.tableH)}" tabindex="0">
      <table>
        <thead><tr><th scope="col">${t(C.colA)}</th><th scope="col">${t(C.colB)}</th></tr></thead>
        <tbody>${C.rows.map((r) => `<tr><td>${t(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="pl-small">${t(C.tableNote)}</p>

    <div class="pl-ex">
      <span class="pl-lbl">${t(C.exH)}</span>
      ${C.exRows.map((r) => `<div class="r"><span>${t(r[0])}</span><b>${esc(r[1])}</b></div>`).join("")}
    </div>

    <div class="pl-terms">
      <h3 class="sec-h" style="font-size:clamp(22px,2.6vw,30px)">${t(C.termsH)}</h3>
      <ul>${C.terms.map((x) => `<li>${t(x)}</li>`).join("")}</ul>
      <p class="pl-disc">${t(C.disclaimer)}</p>
    </div>

    <div class="pl-form" id="partner-apply">
      <h3 class="sec-h" style="font-size:clamp(22px,2.6vw,30px)">${t(C.formH)}</h3>
      <p class="pl-formlead">${t(C.formLead)}</p>
      <ul class="pl-ask">${C.ask.map((x) => `<li>${t(x)}</li>`).join("")}</ul>
      <div style="margin-top:20px"><a class="btn-p" href="mailto:hello@colleagueai.ai?subject=Partner%20programme%20enquiry" data-partner-cta="apply_email">${t(C.emailCta)}</a></div>
    </div>
  </div>
</section>
<script id="cai-partner-levels-js">
(function(){
  function ev(n,p){var s=p||{};
    try{if(window.va&&typeof window.va.track==='function')window.va.track(n,s);}catch(e){}
    try{if(typeof window.plausible==='function')window.plausible(n,{props:s});}catch(e){}
    try{if(window.dataLayer&&typeof window.dataLayer.push==='function')window.dataLayer.push(Object.assign({event:n},s));}catch(e){}}
  var loc=document.documentElement.getAttribute('lang')||'en';
  ev('partner_page_viewed',{locale:loc});
  var cards=document.querySelectorAll('[data-partner-level]');
  if(window.IntersectionObserver&&cards.length){var seen={};
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;
      var k=e.target.getAttribute('data-partner-level');if(seen[k])return;seen[k]=1;
      ev('partner_level_viewed',{level:k,level_name:e.target.getAttribute('data-partner-level-name'),locale:loc});});},{threshold:.4});
    Array.prototype.forEach.call(cards,function(c){io.observe(c);});}
  document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('[data-partner-cta]'):null;
    if(!a)return;ev('partner_cta_clicked',{level:a.getAttribute('data-partner-cta'),href:a.getAttribute('href'),locale:loc});});
})();
</script>`;
}

function privacyFor(loc) {
  const home = loc === DEFAULT_LOCALE ? "public/home.html" : "public/" + loc + "/home.html";
  const html = fs.readFileSync(home, "utf8");
  const foot = html.match(/<footer>[\s\S]*?<\/footer>/)[0];
  const m = foot.match(/href="(\/[^"]*(?:privacy|soukromi|datenschutz|confidentialite|privacidad|prywatnosc|privacidade)[^"]*)"/i);
  return m ? m[1] : "/privacy";
}

function contactFor(loc) {
  const home = loc === DEFAULT_LOCALE ? "public/home.html" : "public/" + loc + "/home.html";
  const html = fs.readFileSync(home, "utf8");
  const nav = html.match(/<nav class="links">([\s\S]*?)<\/nav>/);
  const links = [...nav[1].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]).filter((h) => !/#score/.test(h) && !/\/(score|usage)\/?$/.test(h));
  return links[4] || links[3] || "/contact";
}

const START = "<!-- cai-partner-levels:start -->";
const END = "<!-- cai-partner-levels:end -->";
let n = 0;
for (const loc of SUPPORTED_LOCALE_CODES) {
  const block = (START + "\n" + build(loc, contactFor(loc)) + "\n" + END).split("PRIVACY_HREF").join(privacyFor(loc));
  const files = loc === DEFAULT_LOCALE
    ? ["public/partners.html", "public/en/partners.html", "public/en/partners/index.html"]
    : ["public/" + loc + "/partners.html", "public/" + loc + "/partners/index.html"];
  const all = files.concat(files.map((f) => "dist/" + f.slice("public/".length)));
  for (const f of all) {
    if (!fs.existsSync(f)) continue;
    let html = fs.readFileSync(f, "utf8");
    html = html.replace(new RegExp(START + "[\\s\\S]*?" + END + "\\s*", "g"), "");
    if (!html.includes('<section id="generate">')) { console.warn("no anchor:", f); continue; }
    html = html.replace('<section id="generate">', block + "\n\n<section id=\"generate\">");
    fs.writeFileSync(f, html, "utf8");
    n++;
  }
}
console.log("Partner levels injected into", n, "files");
