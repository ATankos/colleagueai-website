import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const routes = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n.routes.json"), "utf8"));
const read = (p) => fs.readFileSync(p, "utf8");

test("all 36 factsheets render intact catalogue-language labels", () => {
  const dir = path.join(DIST, "agents");
  assert.ok(fs.existsSync(dir), "dist/agents directory is missing");

  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".html")).sort();
  assert.equal(files.length, 36, "expected exactly 36 generated factsheets");

  const expected = ["\u010Ce\u0161tina", "Fran\u00E7ais", "Espa\u00F1ol", "Portugu\u00EAs"];
  const forbidden = ["?e?tina", "Fran?ais", "Espa?ol", "Portugu?s"];

  for (const file of files) {
    const html = read(path.join(dir, file));
    for (const label of expected) {
      assert.ok(html.includes(label), `${file} is missing intact language label: ${label}`);
    }
    for (const label of forbidden) {
      assert.ok(!html.includes(label), `${file} still contains corrupted language label: ${label}`);
    }
  }
});

test("canonical agent catalogue source has the final sales-readiness cleanup", () => {
  const source = read(path.join(ROOT, "public", "agents.html"));

  const calcValues = [...source.matchAll(/"calc_net0":"([^"]*)"/g)].map((m) => m[1]);
  assert.equal(calcValues.length, 8, "expected calc_net0 for all eight locales");
  assert.ok(calcValues.every((v) => !v.includes("€0")), "source still contains EUR zero-state pricing");
  assert.ok(calcValues.every((v) => v.includes("$0")), "all calc_net0 values must use $0");

  const oldDatePattern =
    /June 2026|červen 2026|Juni 2026|juin 2026|junio de 2026|giugno 2026|czerwiec 2026|junho de 2026/i;

  const footNotes = [...source.matchAll(/"foot_note":"([^"]*)"/g)].map((m) => m[1]);
  assert.equal(footNotes.length, 8, "expected foot_note for all eight locales");
  assert.ok(footNotes.every((v) => !oldDatePattern.test(v)), "source still contains a June 2026 footer date");

  const legalValues = [...source.matchAll(/"foot_legal":"([^"]*)"/g)].map((m) => m[1]);
  assert.equal(legalValues.length, 8, "expected foot_legal for all eight locales");
  assert.ok(legalValues.every((v) => !v.includes("<a ")), "foot_legal still embeds duplicate legal links");

  const visibleLegal = source.match(/<span class="flegal" data-i18n-html="foot_legal">([\s\S]*?)<\/span>/);
  assert.ok(visibleLegal, "visible foot_legal fallback is missing");
  assert.ok(!visibleLegal[1].includes("<a "), "visible foot_legal fallback still contains duplicate legal links");
});

test("built catalogue pages contain no stale June footer text or corrupted language labels", () => {
  const oldDatePattern =
    /June 2026|červen 2026|Juni 2026|juin 2026|junio de 2026|giugno 2026|czerwiec 2026|junho de 2026/i;
  const badLabels = ["?e?tina", "Fran?ais", "Espa?ol", "Portugu?s"];

  const catalogueFiles = routes.locales.map((locale) => {
    if (locale === routes.defaultLocale) return path.join(DIST, "agents.html");
    return path.join(DIST, locale, "agents.html");
  });

  for (const file of catalogueFiles) {
    assert.ok(fs.existsSync(file), `missing built catalogue page: ${path.relative(ROOT, file)}`);
    const html = read(file);

    assert.ok(!oldDatePattern.test(html), `${file} still contains a June 2026 footer date`);
    for (const bad of badLabels) {
      assert.ok(!html.includes(bad), `${file} still contains corrupted language text: ${bad}`);
    }

    const legalValues = [...html.matchAll(/"foot_legal":"([^"]*)"/g)].map((m) => m[1]);
    for (const value of legalValues) {
      assert.ok(!value.includes("<a "), `${file} has duplicate legal links embedded in foot_legal`);
    }
  }
});


test("Lighthouse accessibility is a real release gate and keeps its reports", () => {
  const workflow = read(path.join(ROOT, ".github", "workflows", "lighthouse.yml"));
  const step = workflow.match(/- name: Run Lighthouse[\s\S]*?(?=\n\s+- name:)/);
  assert.ok(step, "Lighthouse workflow is missing the Run Lighthouse step");
  assert.ok(!/continue-on-error:\s*true/.test(step[0]),
    "Lighthouse failures are still being converted into a green workflow");
  assert.ok(/include-hidden-files:\s*true/.test(workflow),
    "Lighthouse reports live in .lighthouseci and must be uploaded as hidden files");

  const home = read(path.join(ROOT, "public", "home.html"));
  assert.ok(home.includes("--terra:#A94A2C;--terra-solid:#A94A2C"),
    "homepage still uses the low-contrast terracotta token for small text");
  assert.ok(home.includes("--muted:#6F6A62;--soft:#4A4641"),
    "homepage still uses the low-contrast muted token for small text");
});


test("built homepages satisfy the Lighthouse accessibility defects from PR 419", () => {
  const builtHomes = [
    path.join(DIST, "index.html"),
    ...["cs", "de", "fr", "es", "it", "pl", "pt"].map((loc) => path.join(DIST, loc, "index.html")),
  ];

  for (const file of builtHomes) {
    assert.ok(fs.existsSync(file), `missing built homepage: ${path.relative(ROOT, file)}`);
    const html = read(file);

    assert.equal((html.match(/<main\b/gi) || []).length, 1,
      `${file} must contain exactly one main landmark`);
    assert.ok(!/--terra:\s*#C65D3A/i.test(html),
      `${file} still contains the low-contrast terracotta token`);
    assert.ok(!/--muted:\s*#8A857C/i.test(html),
      `${file} still contains the low-contrast muted token`);

    const rowHeaders = html.match(/<th\s+scope="row">/gi) || [];
    assert.equal(rowHeaders.length, 6,
      `${file} comparison table must expose six row headers`);
  }
});


test("built homepages load the final contrast override", () => {
  const cssFile = path.join(ROOT, "public", "home-a11y.css");
  assert.ok(fs.existsSync(cssFile), "missing public/home-a11y.css");
  const css = read(cssFile);

  assert.match(css, /\.kicker\s*\{[\s\S]*?#8F3F25\s*!important/i,
    "final homepage CSS must force a WCAG-AA kicker colour");
  assert.match(css, /header\s*\{[\s\S]*?background:\s*#22211F\s*!important/i,
    "final homepage CSS must give the header a deterministic solid background");

  const homes = [
    path.join(DIST, "index.html"),
    ...["cs", "de", "fr", "es", "it", "pl", "pt"].map((loc) => path.join(DIST, loc, "index.html")),
  ];

  for (const file of homes) {
    assert.ok(fs.existsSync(file), `missing built homepage: ${path.relative(ROOT, file)}`);
    const html = read(file);
    assert.ok(html.includes('href="/home-a11y.css"'),
      `${file} is missing the final homepage contrast stylesheet`);
  }
});


test("shared mobile stylesheet cannot override homepage contrast back to legacy coral", () => {
  const mobileCss = read(path.join(ROOT, "public", "colleagueai-mobile-fix.css"));

  const legacyLogo = mobileCss.lastIndexOf(
    ".logo b, header .logo b, .cai-hdr-logo b, .cai-uni-logo b"
  );
  const safeLogo = mobileCss.lastIndexOf(
    "header .logo b {\n  color: #E8A07F !important;"
  );
  assert.ok(safeLogo > legacyLogo,
    "the final header logo contrast rule must come after the legacy coral override");

  const legacyKicker = mobileCss.lastIndexOf(
    ".eyebrow, .kicker, .overline"
  );
  const safeKicker = mobileCss.lastIndexOf(
    "body > main#main .kicker {\n  color: #8F3F25 !important;"
  );
  assert.ok(safeKicker > legacyKicker,
    "the final homepage kicker contrast rule must come after the legacy coral override");

  const built = read(path.join(DIST, "index.html"));
  assert.ok(built.includes("colleagueai-mobile-fix.css"),
    "built homepage must load the shared mobile stylesheet");
  assert.ok(built.includes('id="main"'),
    "built homepage must preserve the main landmark");
});
