#!/usr/bin/env node
// Post-installation readiness check for ColleagueAI Contract Intelligence & Register (CAI-L4-CI-001).
// Read-only: it only sends GET requests to the Dataverse Web API of the environment you name.
//
//   DATAVERSE_TOKEN="$(az account get-access-token --resource https://ORG.crm4.dynamics.com --query accessToken -o tsv)" \
//   node scripts/check-cai-install-readiness.mjs --url https://ORG.crm4.dynamics.com [--expect-version 1.0.3.2] [--daily-recompute off]
//
// Exit code 0 = ready; 1 = at least one required check failed (for example a flow is still Off); 2 = usage error.
// --daily-recompute off : accept the Daily recompute flow being Off (recommended while you test; see INSTALL section 5).
//
// What it checks (INSTALL appendix): the solution and its version; the five required environment values; the four
// connection references; the seven flows On; the security role read-only on the ColleagueAI tables; the agent's
// authentication mode and whether it has ever been published. It does not change anything and does not publish.

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const url = (opt('--url') || '').replace(/\/+$/, '');
const expectVersion = opt('--expect-version');
const dailyOff = (opt('--daily-recompute', 'on') || 'on').toLowerCase() === 'off';
const token = process.env.DATAVERSE_TOKEN;
if (!/^https:\/\/[a-z0-9-]+\.crm[0-9]*\.dynamics\.com$/i.test(url) || !token) {
  console.error('Usage: DATAVERSE_TOKEN=... node scripts/check-cai-install-readiness.mjs --url https://ORG.crmN.dynamics.com [--expect-version X.Y.Z.W] [--daily-recompute off]');
  process.exit(2);
}

const SOLUTION = 'CAIContractIntelligence';
const REQUIRED_VARS = ['cai_SharePointSiteUrl', 'cai_ContractLibraryId', 'cai_ReviewerUpn', 'cai_AdminAlertUpn', 'cai_ContractOwnerTeam'];
const DEFAULTED_VARS = ['cai_BusinessTimeZone', 'cai_BusinessTimeZoneIana', 'cai_RecomputeWindowDays', 'cai_RecomputeFullPassDay'];
const FLOWS = ['CAI CI - Content version', 'CAI CI - Effective terms', 'CAI CI - Compute - Get effective terms',
  'CAI CI - Compute - Notice deadlines', 'CAI CI - Review gate (Teams)', 'CAI CI - Extract contract on upload', 'CAI CI - Daily recompute'];
const ROLE = 'CAI Contract Reader';
const CONTRACT_TABLES = ['cai_contract', 'cai_fieldevidence', 'cai_review', 'cai_jobrun'];

async function get(path) {
  const r = await fetch(`${url}/api/data/v9.2/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
  });
  if (!r.ok) throw new Error(`GET ${path} -> HTTP ${r.status}`);
  return r.json();
}

const results = [];
const check = (id, title, ok, detail, required = true) => results.push({ id, title, ok, detail, required });

try {
  // R1 solution
  const sol = (await get(`solutions?$select=solutionid,version,ismanaged&$filter=uniquename eq '${SOLUTION}'`)).value[0];
  check('R1', 'Solution installed (managed)', Boolean(sol && sol.ismanaged), sol ? `version ${sol.version}` : 'not found');
  if (sol && expectVersion) check('R1b', `Solution version is ${expectVersion}`, sol.version === expectVersion, `found ${sol.version}`);
  if (!sol) throw new Error('solution not installed; nothing else to check');

  // R2 environment values
  const defs = (await get("environmentvariabledefinitions?$select=schemaname,defaultvalue&$filter=startswith(schemaname,'cai_')&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")).value;
  const byName = new Map(defs.map((d) => [d.schemaname, d]));
  const blank = REQUIRED_VARS.filter((n) => {
    const d = byName.get(n);
    const v = d && d.environmentvariabledefinition_environmentvariablevalue && d.environmentvariabledefinition_environmentvariablevalue[0];
    return !(v && String(v.value || '').trim());
  });
  check('R2', 'Five required environment values are set', blank.length === 0, blank.length ? `blank: ${blank.join(', ')}` : 'all five set');
  const missingDefaults = DEFAULTED_VARS.filter((n) => !byName.has(n) || !String(byName.get(n).defaultvalue || '').trim());
  check('R2b', 'Defaulted variables carry a default', missingDefaults.length === 0, missingDefaults.length ? `no default: ${missingDefaults.join(', ')}` : DEFAULTED_VARS.join(', '));

  // R3 connection references of this solution
  const comps = (await get(`solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${sol.solutionid} and componenttype eq 10129`)).value;
  const refs = [];
  for (const c of comps) {
    const r = (await get(`connectionreferences?$select=connectionreferencelogicalname,connectionid,connectorid&$filter=connectionreferenceid eq ${c.objectid}`)).value[0];
    if (r) refs.push(r);
  }
  const unbound = refs.filter((r) => !r.connectionid);
  check('R3', 'Four connection references bound to a connection', refs.length === 4 && unbound.length === 0,
    `${refs.length} found; unbound: ${unbound.map((r) => r.connectionreferencelogicalname).join(', ') || 'none'}`);

  // R4 flows
  const flows = (await get("workflows?$select=name,statecode&$filter=category eq 5 and startswith(name,'CAI CI')")).value;
  const state = new Map(flows.map((f) => [f.name, f.statecode]));
  const off = FLOWS.filter((n) => state.get(n) !== 1 && !(dailyOff && n === 'CAI CI - Daily recompute'));
  const missing = FLOWS.filter((n) => !state.has(n));
  check('R4', `Seven flows present and On${dailyOff ? ' (Daily recompute may be Off)' : ''}`, missing.length === 0 && off.length === 0,
    `missing: ${missing.join(', ') || 'none'}; off: ${off.join(', ') || 'none'}`);
  if (dailyOff && state.get('CAI CI - Daily recompute') === 1) {
    check('R4b', 'Daily recompute is Off while testing', false, 'it is On: it will run at 05:30 and use Copilot Studio capacity; turn it off until go-live', false);
  }

  // R5 role: read-only on the ColleagueAI tables
  const role = (await get(`roles?$select=roleid&$filter=name eq '${ROLE}'`)).value[0];
  if (!role) check('R5', `Role "${ROLE}" exists`, false, 'not found');
  else {
    const privs = (await get(`roles(${role.roleid})/roleprivileges_association?$select=name`)).value.map((p) => p.name);
    const onContract = privs.filter((p) => CONTRACT_TABLES.some((t) => p.toLowerCase().endsWith(t)));
    const notRead = onContract.filter((p) => !/^prvRead/.test(p));
    check('R5', `Role "${ROLE}" is read-only on the ColleagueAI tables`, notRead.length === 0 && onContract.length > 0,
      `${privs.length} privileges in total (9 or 11 expected); on ColleagueAI tables: ${onContract.join(', ') || 'none'}; not Read: ${notRead.join(', ') || 'none'}`);
    check('R5b', 'Role privilege count is 9 or 11', privs.length === 9 || privs.length === 11, `${privs.length}`, false);
  }

  // R6 agent
  const bot = (await get("bots?$select=name,authenticationmode,publishedon,statecode&$filter=startswith(name,'CAI Contract Intelligence')")).value[0];
  if (!bot) check('R6', 'Agent exists', false, 'not found');
  else {
    check('R6', 'Agent authenticates with Microsoft (per-user identity)', bot.authenticationmode === 2, `authenticationmode ${bot.authenticationmode}`);
    check('R6b', 'Agent has not been published from this environment', !bot.publishedon,
      bot.publishedon ? `published on ${bot.publishedon}: check Microsoft 365 admin center -> Agents and Block it unless you decided to publish (INSTALL section 7)` : 'never published (Draft)', false);
  }
} catch (e) {
  check('R0', 'Web API reachable with this token', false, e.message);
}

let failed = 0;
for (const r of results) {
  const tag = r.ok ? 'PASS' : r.required ? 'FAIL' : 'WARN';
  if (!r.ok && r.required) failed += 1;
  console.log(`${tag} ${r.id} ${r.title}\n     ${r.detail}`);
}
console.log(`\n${failed === 0 ? 'READY' : 'NOT READY'}: ${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
