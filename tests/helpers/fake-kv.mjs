/**
 * tests/helpers/fake-kv.mjs - an in-process Upstash REST fake with FAILURE INJECTION, for the certificate recovery tests.
 * Supports the commands lib/db.js sends: GET, SET (NX, EX), DEL, INCR, EXPIRE, RPUSH, LRANGE, LREM, and the EVAL
 * compare-and-set (tests/kv-cas-fake.mjs). failOn(match, times) makes the next `times` commands for which match({ cmd, args })
 * is true answer HTTP 500, which lib/db.js raises as an error: that is how a partial database failure is simulated.
 * Not a test file; nothing runs on import.
 */
import http from 'node:http';
import { casServe } from '../kv-cas-fake.mjs';

export function createFakeKv() {
  const store = new Map();
  const lists = new Map();
  const rules = [];
  const log = [];
  const hit = (cmd, args) => {
    const rule = rules.find((r) => r.times > 0 && r.match({ cmd, args }));
    if (!rule) return false;
    rule.times -= 1;
    return true;
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      return casServe(store, req, res, {
        onCommand: (command) => { log.push({ cmd: 'EVAL', args: command.slice(3, 4) }); if (hit('EVAL', command.slice(3))) throw new Error('injected failure'); },
      });
    }
    const [, cmd, ...args] = req.url.split('/').map(decodeURIComponent);
    log.push({ cmd, args });
    if (hit(cmd, args)) { res.writeHead(500); return res.end('injected failure'); }
    const reply = (result) => res.end(JSON.stringify({ result }));
    switch (cmd) {
      case 'GET': return reply(store.get(args[0]) ?? null);
      case 'SET': {
        const [key, value, ...flags] = args;
        if (flags.includes('NX') && store.has(key)) return reply(null);
        store.set(key, value);
        return reply('OK');
      }
      case 'DEL': return reply(store.delete(args[0]) ? 1 : 0);
      case 'INCR': { const n = Number(store.get(args[0]) ?? 0) + 1; store.set(args[0], String(n)); return reply(n); }
      case 'EXPIRE': return reply(1);
      case 'RPUSH': { const l = lists.get(args[0]) || []; l.push(args[1]); lists.set(args[0], l); return reply(l.length); }
      case 'LRANGE': return reply([...(lists.get(args[0]) || [])]);
      case 'LREM': { const l = lists.get(args[0]) || []; const kept = l.filter((x) => x !== args[2]); lists.set(args[0], kept); return reply(l.length - kept.length); }
      default: return reply(null);
    }
  });
  return {
    store, lists, log,
    async start() {
      await new Promise((r) => server.listen(0, r));
      process.env.KV_REST_API_URL = `http://127.0.0.1:${server.address().port}`;
      process.env.KV_REST_API_TOKEN = 'local-dummy-token';
    },
    stop() { server.closeAllConnections?.(); server.close(); },
    reset() { store.clear(); lists.clear(); rules.length = 0; log.length = 0; },
    failOn(match, times = 1) { rules.push({ match, times }); },
    clearFailures() { rules.length = 0; },
    commands: (cmd) => log.filter((l) => l.cmd === cmd),
  };
}
