#!/usr/bin/env node
// Deadline-integrity check for ColleagueAI Contract Intelligence & Register (CAI-L4-CI-001) release 1.0.3.4 and later.
// Read-only: it sends GET requests to the Dataverse Web API of the environment you name and changes nothing.
//
//   DATAVERSE_TOKEN="$(az account get-access-token --resource https://ORG.crmN.dynamics.com --query accessToken -o tsv)" \
//   node scripts/cai-release/1.0.3.4/check-deadline-integrity.mjs --url https://ORG.crmN.dynamics.com
//
// Exit code 0 = no contract stores a deadline that is not CONFIRMED; 1 = at least one does (listed); 2 = usage error.
//
// What it looks for. Release 1.0.3.4 stores a notice deadline only when it is CONFIRMED (reviewer-approved notice
// period, no open review reason, a calculation basis). A record written by an earlier release can still carry a
// date with an open review reason ("stale"): the agent does not answer it, but the value stays readable through the
// Dataverse API until the record is recalculated. The documented correction is one run of "CAI CI - Daily recompute"
// (INSTALL section 4), which selects exactly these records whatever the window; this script lists them before and
// confirms none remain afterwards. Running it any number of times changes nothing.

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const url = (opt('--url') || '').replace(/\/+$/, '');
const token = process.env.DATAVERSE_TOKEN;
if (!/^https:\/\/[a-z0-9-]+\.crm[0-9]*\.dynamics\.com$/i.test(url) || !token) {
  console.error('Usage: DATAVERSE_TOKEN=... node check-deadline-integrity.mjs --url https://ORG.crmN.dynamics.com');
  process.exit(2);
}

async function getAll(path) {
  const rows = [];
  let next = `${url}/api/data/v9.2/${path}`;
  while (next) {
    const r = await fetch(next, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } });
    if (!r.ok) throw new Error(`GET ${path} -> HTTP ${r.status}`);
    const body = await r.json();
    rows.push(...body.value);
    next = body['@odata.nextLink'] || null;
  }
  return rows;
}

const NOT_VERIFIED = 'DEADLINE NOT VERIFIED';
const rows = await getAll("cai_contracts?$select=cai_contractreference,cai_documentrole,cai_noticedeadline,cai_noticestatus,cai_deadlinereview,cai_deadlinebasis,cai_termscomputedon&$filter=cai_documentrole eq 'master'");
const stale = rows.filter((r) => r.cai_noticedeadline && (r.cai_deadlinereview || !r.cai_deadlinebasis || String(r.cai_noticestatus || '').startsWith(NOT_VERIFIED)));
const unverified = rows.filter((r) => String(r.cai_noticestatus || '').startsWith(NOT_VERIFIED));
const confirmed = rows.filter((r) => r.cai_noticedeadline && !stale.includes(r));

console.log(`Master records: ${rows.length}`);
console.log(`Confirmed deadlines stored: ${confirmed.length}`);
console.log(`Not verified (no date expected): ${unverified.length}, of which store a date: ${unverified.filter((r) => r.cai_noticedeadline).length}`);
console.log(`Stored deadlines that are not CONFIRMED: ${stale.length}`);
for (const r of stale) {
  const why = r.cai_deadlinereview ? 'open review reason' : !r.cai_deadlinebasis ? 'no calculation basis' : 'status says not verified';
  console.log(`  ${r.cai_contractreference}  ${String(r.cai_noticedeadline).slice(0, 10)}  (${why}; calculated ${String(r.cai_termscomputedon || 'never').slice(0, 16)})`);
}
if (stale.length) console.log('\nCorrect them with one run of "CAI CI - Daily recompute" (INSTALL section 4), then run this check again.');
console.log(stale.length ? '\nNOT CLEAN' : '\nCLEAN: every stored deadline is CONFIRMED.');
process.exit(stale.length ? 1 : 0);
