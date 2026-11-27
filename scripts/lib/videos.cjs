/* videos.cjs: the ONE renderer for site video (feature player, compact cards, captions, transcripts, VideoObject).
 *
 * Sources: config/media.json (assets, checksums, approval), scripts/i18n/videos/<id>.json (timed narration in eight
 * languages) and scripts/i18n/videos/meta.json (titles, descriptions, disclosures, calls to action, player strings).
 *
 * Rules built in:
 *   - Nothing renders unless the video is approved (approvedBy + approvedOn), its file is same-origin under /media/
 *     and it has captions in all eight languages. A Preview build with CAI_VIDEO_PREVIEW=1 (never Production) also
 *     renders 'pending-approval' videos, behind a visible banner and without structured data. 'held' never renders.
 *   - No video bytes before interaction: the page carries a poster button and an inert <template>; the <video> element
 *     is created on click (public/cai-video.js). No autoplay, no third-party player, no cookies, no storage.
 *   - Subtitles are drawn in a caption bar BELOW the picture, never over it, because three of the four masters have
 *     English captions burned in. Translations therefore never overlap the burned-in English.
 *   - Every player carries its disclosure (illustrative content, Coming soon, planning estimates) next to it, and a
 *     crawlable transcript in the page's language.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCALES = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const ORIGIN = 'https://www.colleagueai.ai';
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const MEDIA = (() => { try { return read('config/media.json'); } catch { return {}; } })();
const REG = MEDIA.videos && typeof MEDIA.videos === 'object' ? MEDIA.videos : {};
const META = read('scripts/i18n/videos/meta.json');
const SEGMENTS = {};
const segmentsOf = (id) => {
  if (!SEGMENTS[id]) SEGMENTS[id] = read(`scripts/i18n/videos/${id}.json`).segments;
  return SEGMENTS[id];
};

const LOCAL_FILE = /^\/media\/[a-z0-9._-]+$/i;
const LOCAL_VTT = /^\/media\/[a-z0-9._-]+\.vtt$/i;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** True only on a Preview build that asked for review rendering. Production can never enter preview mode. */
function previewMode(env = process.env) {
  return env.CAI_VIDEO_PREVIEW === '1' && env.VERCEL_ENV !== 'production';
}

function captionsComplete(v) {
  const caps = v && v.captions && typeof v.captions === 'object' ? v.captions : {};
  return LOCALES.every((l) => typeof caps[l] === 'string' && LOCAL_VTT.test(caps[l]));
}

/** Approved for publication: recorded approval, same-origin file, captions in every language, not held. */
function approved(id) {
  const v = REG[id];
  if (!v || typeof v !== 'object' || v.status === 'held') return false;
  return LOCAL_FILE.test(v.src || '') && Boolean(v.approvedBy) && Boolean(v.approvedOn) && captionsComplete(v);
}

/** What a build may render: approved videos, plus pending ones on a review Preview. */
function renderable(id, env = process.env) {
  if (approved(id)) return true;
  const v = REG[id];
  return Boolean(previewMode(env) && v && v.status === 'pending-approval' && LOCAL_FILE.test(v.src || '') && captionsComplete(v));
}

const t = (group, key, loc) => {
  const g = META[group][key];
  return (g && (g[loc] || g.en)) || '';
};
const vt = (id, field, loc) => {
  const f = META.videos[id] && META.videos[id][field];
  return (f && (f[loc] || f.en)) || '';
};

function clock(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function isoDuration(sec) {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `PT${m ? `${m}M` : ''}${s % 60}S`;
}

/* ---------- captions ---------- */
const MAX_LINE = 42;
const MAX_CUE = MAX_LINE * 2;

/** Split one narration segment into caption-sized pieces of balanced length. Each cut goes to the natural break
 *  (sentence end, then clause, then word) nearest the ideal position, so no orphan fragment is left behind. */
function pieces(text) {
  if (text.length <= MAX_CUE) return [text];
  const n = Math.ceil(text.length / MAX_CUE);
  const breaks = [];
  for (let i = 1; i < text.length; i += 1) {
    if (text[i] !== ' ') continue;
    const prev = text[i - 1];
    const weight = '.!?;:'.includes(prev) ? 0 : ',–—'.includes(prev) ? 1 : 2;
    breaks.push({ at: i, weight });
  }
  const out = [];
  let from = 0;
  for (let k = 1; k < n; k += 1) {
    const ideal = from + (text.length - from) / (n - k + 1);
    let best = null;
    for (const b of breaks) {
      if (b.at <= from + 8 || b.at - from > MAX_CUE || text.length - b.at > MAX_CUE * (n - k)) continue;
      const cost = Math.abs(b.at - ideal) + b.weight * 12;
      if (!best || cost < best.cost) best = { at: b.at, cost };
    }
    const cut = best ? best.at : Math.min(from + MAX_CUE, text.length);
    out.push(text.slice(from, cut).trim());
    from = cut;
  }
  out.push(text.slice(from).trim());
  return out.filter(Boolean);
}

/** Wrap a cue into at most two balanced lines. */
function wrap(text) {
  if (text.length <= MAX_LINE) return text;
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score) best = { score, a, b };
  }
  return best ? `${best.a}\n${best.b}` : text;
}

/** Timed cues for one language: each segment's pieces share its time span in proportion to their length. */
function cues(id, lang) {
  const out = [];
  const segs = segmentsOf(id);
  segs.forEach((seg, si) => {
    const text = seg[lang];
    if (typeof text !== 'string' || !text) return;
    const [start, spoken] = seg.t;
    /* Let the last cue stay up through the pause after the line (up to 0.8 s, never into the next line). */
    const next = segs[si + 1] ? segs[si + 1].t[0] - 0.04 : spoken + 0.8;
    const end = Math.max(spoken, Math.min(spoken + 0.8, next));
    const ps = pieces(text);
    const total = ps.reduce((n, p) => n + p.length, 0);
    let at = start;
    ps.forEach((p, i) => {
      const until = i === ps.length - 1 ? end : at + ((end - start) * p.length) / total;
      out.push({ start: at, end: until, text: wrap(p) });
      at = until;
    });
  });
  return out;
}

function stamp(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** WebVTT text. Translated tracks of a video with burned-in English captions are positioned at the top, so a
 *  browser that draws them natively (iOS full screen) does not lay them over the English. The site's own player
 *  draws every track below the picture instead. */
function vtt(id, lang) {
  const v = REG[id] || {};
  const settings = v.burnedCaptions && lang !== 'en' ? ' line:6% position:50% align:center' : '';
  const body = cues(id, lang).map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}${settings}\n${c.text}`).join('\n\n');
  return `WEBVTT\nKind: ${lang === 'en' ? 'captions' : 'subtitles'}\nLanguage: ${lang}\n\n${body}\n`;
}

/** The transcript in one language, as paragraphs of about three narration segments. */
function transcriptHtml(id, lang) {
  const lines = segmentsOf(id).map((s) => s[lang]).filter((x) => typeof x === 'string' && x);
  const paras = [];
  for (let i = 0; i < lines.length; i += 3) paras.push(`<p>${esc(lines.slice(i, i + 3).join(' '))}</p>`);
  return paras.join('');
}
function transcriptText(id, lang) {
  return segmentsOf(id).map((s) => s[lang]).filter((x) => typeof x === 'string' && x).join(' ');
}

/* ---------- markup ---------- */
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" focusable="false" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';

/**
 * The feature player. opts: { cta: 'demo'|'catalogue'|'partner'|'certified'|'factsheet', ctaHref, level: 2|3 }.
 * Renders '' when the video may not be shown in this build.
 */
function renderFeature(id, loc, opts = {}, env = process.env) {
  if (!renderable(id, env)) return '';
  const v = REG[id];
  const title = vt(id, 'title', loc);
  const lvl = opts.level === 3 ? 3 : 2;
  const dur = clock(v.durationSec);
  const defaultCc = v.burnedCaptions && loc === 'en' ? 'off' : loc;
  const options = [`<option value="off"${defaultCc === 'off' ? ' selected' : ''}>${esc(t('ui', 'off', loc))}</option>`]
    .concat(LOCALES.map((l) => `<option value="${l}" lang="${l}"${defaultCc === l ? ' selected' : ''}>${esc(META.languages[l])}</option>`))
    .join('');
  const tracks = LOCALES.map((l) => `<track kind="${l === 'en' ? 'captions' : 'subtitles'}" srclang="${l}" label="${esc(META.languages[l])}" src="${esc(v.captions[l])}">`).join('');
  const pending = !approved(id);
  const banner = pending ? '<p class="cai-video__pending" role="note">Preview: this video is pending approval and is not published.</p>' : '';
  const cta = opts.cta && opts.ctaHref
    ? `<a class="cai-video__cta" href="${esc(opts.ctaHref)}">${esc(t('cta', opts.cta, loc))} <span aria-hidden="true">→</span></a>` : '';
  const burned = v.burnedCaptions ? `<p class="cai-video__note">${esc(t('ui', 'burned', loc))}</p>` : '';
  const srcset = v.posterSmall ? ` srcset="${esc(v.posterSmall)} 640w, ${esc(v.poster)} 1280w" sizes="(max-width: 720px) 100vw, 920px"` : '';
  return `<section class="cai-video-sec" aria-labelledby="video-${id}-title" data-cai-video-sec="${id}">
<figure class="cai-video" id="video-${id}" data-cai-video="${id}">${banner}
<div class="cai-video__frame">
<div class="cai-video__stage">
<button type="button" class="cai-video__facade" data-cai-video-play>
<img src="${esc(v.poster)}"${srcset} width="1280" height="720" alt="" loading="lazy" decoding="async">
<span class="cai-video__sr">${esc(`${t('ui', 'play', loc)}: ${title},`)} </span><span class="cai-video__btn" aria-hidden="true">${PLAY_ICON}</span><span class="cai-video__dur">${dur}</span>
</button>
<template data-cai-video-tpl><video controls playsinline preload="metadata" controlslist="nodownload nofullscreen noremoteplayback" disablepictureinpicture poster="${esc(v.poster)}" src="${esc(v.src)}">${tracks}</video></template>
</div>
<div class="cai-video__cc" data-cai-video-cc aria-hidden="true" hidden></div>
</div>
<div class="cai-video__bar">
<h${lvl} class="cai-video__title" id="video-${id}-title">${esc(title)}</h${lvl}>
<span class="cai-video__time"><span class="cai-video__sr">${esc(t('ui', 'duration', loc))}: </span>${dur}</span>
<label class="cai-video__lang"><span>${esc(t('ui', 'subtitles', loc))}</span> <select data-cai-video-cc-select>${options}</select></label>
<button type="button" class="cai-video__fs" data-cai-video-fs>${esc(t('ui', 'fullscreen', loc))}</button>
</div>
<figcaption class="cai-video__caption"><p class="cai-video__desc">${esc(vt(id, 'description', loc))}</p><p class="cai-video__disc">${esc(vt(id, 'disclosure', loc))}</p>${burned}${cta}</figcaption>
<details class="cai-video__tx"><summary>${esc(t('ui', 'transcript', loc))}</summary><div class="cai-video__txbody" lang="${loc}">${transcriptHtml(id, loc)}</div></details>
</figure>
</section>`;
}

/** A strip of compact cards linking to where each video plays. items: [{ id, href }]. Skips videos not shown. */
function renderCards(items, loc, env = process.env) {
  const shown = items.filter((it) => renderable(it.id, env));
  if (!shown.length) return '';
  const uid = shown.map((it) => it.id).join('-');
  const cards = shown.map(({ id, href }) => {
    const v = REG[id];
    return `<li><a class="cai-vcard" href="${esc(href)}#video-${id}"><img src="${esc(v.posterSmall || v.poster)}" width="640" height="360" alt="" loading="lazy" decoding="async"><span class="cai-vcard__t">${esc(vt(id, 'title', loc))}</span><span class="cai-vcard__d">${esc(t('ui', 'watch', loc))} · ${clock(v.durationSec)}</span></a></li>`;
  }).join('');
  return `<section class="cai-vstrip" aria-labelledby="vstrip-${uid}" data-cai-vstrip="${uid}"><h2 id="vstrip-${uid}" class="cai-vstrip__h">${esc(t('ui', 'videos', loc))}</h2><ul>${cards}</ul></section>`;
}

/** VideoObject for a page that hosts the feature player. Approved videos only: a Preview never emits it. */
function jsonLd(id, loc, pageUrl) {
  if (!approved(id)) return '';
  const v = REG[id];
  const abs = (p) => `${ORIGIN}${p}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': `${pageUrl}#video-${id}`,
    name: vt(id, 'title', loc),
    description: vt(id, 'description', loc),
    thumbnailUrl: [abs(v.poster)],
    uploadDate: v.approvedOn,
    duration: isoDuration(v.durationSec),
    contentUrl: abs(v.src),
    encodingFormat: 'video/mp4',
    width: v.width,
    height: v.height,
    inLanguage: v.audioLanguage,
    isFamilyFriendly: true,
    caption: LOCALES.map((l) => ({ '@type': 'MediaObject', encodingFormat: 'text/vtt', inLanguage: l, contentUrl: abs(v.captions[l]) })),
    transcript: transcriptText(id, loc),
    publisher: { '@type': 'Organization', name: 'Colleague AI s.r.o.', url: `${ORIGIN}/` },
  };
  return `<script type="application/ld+json" data-cai-video-ld="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

const CSS = `
.cai-video-sec{max-width:960px;margin:48px auto;padding:0 20px;box-sizing:border-box}
.cai-video{margin:0;color:#2B2A28}
.cai-video__pending{margin:0 0 10px;padding:8px 12px;border:1px dashed #A94A2C;border-radius:10px;background:#FBF2EE;font-size:13.5px;color:#7a2f18}
.cai-video__frame{position:relative;border-radius:16px;overflow:hidden;background:#1d1b1a;box-shadow:0 18px 40px -24px rgba(43,42,40,.55)}
.cai-video__stage{position:relative;aspect-ratio:16/9;background:#1d1b1a}
.cai-video__stage video{display:block;width:100%;height:100%;background:#000}
.cai-video__facade{all:unset;box-sizing:border-box;position:absolute;inset:0;display:block;cursor:pointer}
.cai-video__facade img{display:block;width:100%;height:100%;object-fit:cover}
.cai-video__facade::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.38))}
.cai-video__btn{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#A94A2C;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.35);z-index:1;transition:transform .15s ease}
.cai-video__btn svg{margin-left:4px}
.cai-video__dur{position:absolute;right:14px;bottom:12px;z-index:1;padding:3px 10px;border-radius:100px;background:rgba(20,19,18,.78);color:#fff;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.cai-video__facade:hover .cai-video__btn{transform:scale(1.06)}
.cai-video__facade:focus-visible{outline:3px solid #A94A2C;outline-offset:-3px}
.cai-video__facade:focus-visible .cai-video__btn{box-shadow:0 0 0 4px #fff,0 0 0 7px #A94A2C}
.cai-video__cc{min-height:2.9em;padding:10px 16px;background:#1d1b1a;color:#fff;font-size:17px;line-height:1.4;text-align:center;white-space:pre-line}
.cai-video__bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:14px 0 0}
.cai-video .cai-video__title{margin:0;font-size:18px;font-weight:600;line-height:1.3;flex:1 1 260px;min-width:0;text-transform:none;letter-spacing:normal;color:#2B2A28}
.cai-video__time{font-size:14px;color:#4A4641;font-variant-numeric:tabular-nums}
.cai-video__sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cai-video__lang{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#4A4641}
.cai-video__lang select,.cai-video__fs{font:inherit;font-size:14px;min-height:36px;padding:5px 10px;border:1px solid #d8d2c6;border-radius:100px;background:#fff;color:#2B2A28}
.cai-video__fs{cursor:pointer}
.cai-video__lang select:focus-visible,.cai-video__fs:focus-visible,.cai-video__cta:focus-visible,.cai-video__tx summary:focus-visible,.cai-vcard:focus-visible{outline:3px solid #A94A2C;outline-offset:2px}
.cai-video__caption{margin:12px 0 0;font-size:15px;line-height:1.6}
.cai-video__caption p{margin:0 0 8px;max-width:72ch}
.cai-video__disc,.cai-video__note{font-size:13.5px;color:#4A4641}
.cai-video__cta{display:inline-block;margin-top:4px;color:#9A3D1F;font-weight:600}
.cai-video__tx{margin-top:12px;border-top:1px solid #E2D9CB;padding-top:10px}
.cai-video__tx summary{cursor:pointer;font-weight:600;font-size:15px}
.cai-video__txbody{max-height:420px;overflow:auto;margin-top:8px;font-size:15px;line-height:1.65}
.cai-video__txbody p{margin:0 0 10px;max-width:72ch}
.cai-video__frame:fullscreen{display:flex;flex-direction:column;justify-content:center;border-radius:0;background:#000}
.cai-video__frame:fullscreen .cai-video__stage{flex:1 1 auto;aspect-ratio:auto;min-height:0}
.cai-video__frame:fullscreen video{object-fit:contain}
.cai-video__frame:fullscreen .cai-video__cc{font-size:clamp(18px,2.4vw,30px)}
.cai-vstrip{max-width:1080px;margin:40px auto;padding:0 20px;box-sizing:border-box}
.cai-vstrip__h{margin:0 0 12px;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#5c574f}
.cai-vstrip ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:14px}
.cai-vcard{display:flex;flex-direction:column;gap:6px;text-decoration:none;color:#2B2A28;border:1px solid #E2D9CB;border-radius:14px;padding:8px 8px 12px;background:#fff;height:100%;box-sizing:border-box}
.cai-vcard img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:9px}
.cai-vcard__t{font-weight:600;font-size:15px;line-height:1.35;padding:0 4px}
.cai-vcard__d{font-size:13.5px;color:#9A3D1F;font-weight:600;padding:0 4px}
.cai-vcard:hover .cai-vcard__t{text-decoration:underline}
@media (max-width:560px){.cai-video-sec{padding:0 14px;margin:32px auto}.cai-video__btn{width:64px;height:64px;margin:-32px 0 0 -32px}.cai-video__cc{font-size:15.5px}}
@media (prefers-reduced-motion:reduce){.cai-video__btn{transition:none}.cai-video__facade:hover .cai-video__btn{transform:none}}
`.trim();

module.exports = {
  LOCALES, REG, META, ORIGIN, CSS,
  previewMode, captionsComplete, approved, renderable,
  cues, vtt, pieces, wrap, transcriptHtml, transcriptText, clock, isoDuration,
  renderFeature, renderCards, jsonLd,
};
