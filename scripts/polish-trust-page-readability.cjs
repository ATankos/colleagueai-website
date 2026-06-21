const fs = require('fs');
const path = require('path');

const roots = ['public', 'dist'];
const marker = 'trust-page-readability-polish';

const css = `
<style id="${marker}">
  /* Trust page readability polish: layout only, no legal/compliance copy changes */
  main {
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: clamp(18px, 4vw, 44px);
  }

  section {
    scroll-margin-top: 84px;
  }

  h1,
  h2,
  h3 {
    text-wrap: balance;
  }

  p,
  li {
    line-height: 1.65;
  }

  #trust-page-guide-title {
    margin-top: clamp(28px, 5vw, 56px);
    margin-bottom: 14px;
  }

  #trust-page-guide-title + p {
    max-width: 780px;
  }

  article,
  .card,
  [class*="card"],
  [class*="guide"],
  [class*="panel"] {
    border-radius: 22px;
  }

  article,
  [class*="guide"],
  [class*="panel"] {
    overflow-wrap: anywhere;
  }

  a {
    text-underline-offset: 3px;
  }

  @media (max-width: 768px) {
    main {
      padding-inline: 18px;
    }

    #trust-page-guide-title {
      margin-top: 32px;
    }

    article,
    .card,
    [class*="card"],
    [class*="guide"],
    [class*="panel"] {
      border-radius: 18px;
    }
  }
</style>
`;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let patched = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    const normalized = file.replaceAll('\\', '/');
    const isTrustPage =
      normalized.endsWith('/trust.html') ||
      normalized.endsWith('/trust/index.html') ||
      normalized === 'public/trust.html' ||
      normalized === 'dist/trust.html';

    if (!isTrustPage) continue;

    let html = fs.readFileSync(file, 'utf8');
    if (html.includes(`id="${marker}"`)) continue;

    if (!html.includes('</head>')) {
      throw new Error(`Missing </head> in ${file}`);
    }

    html = html.replace('</head>', `${css}\n</head>`);
    fs.writeFileSync(file, html);
    patched += 1;
  }
}

console.log(`[trust-readability] patched ${patched} trust page files`);
