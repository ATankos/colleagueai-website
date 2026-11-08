/**
 * tests/kv-cas-fake.mjs - the one command the entitlement code sends that the fake Upstash servers in the tests
 * cannot answer with GET, SET and DEL: lib/db.js changes a buyer's record with an EVAL compare-and-set
 * (updateEntitlement), posted as a JSON command. A fake that serves a test touching entitlements runs it here,
 * over its own Map. This is not a test file; nothing runs when it is imported.
 *
 * The emulation is the script's contract, nothing more: store ARGV[2] at KEYS[1] only if the key still holds
 * ARGV[1] ('' = absent), and answer [1 or 0, what the key holds now]. The Lua itself is checked against a real
 * redis-server by the notes on the pull request that introduced it.
 */

/** Apply one posted command (already parsed: ['EVAL', script, '1', key, expected, replacement]) to `store`. */
export function casReply(store, command, onStored) {
  const [name, script, numkeys, key, expected, replacement] = command;
  if (String(name).toUpperCase() !== 'EVAL' || String(numkeys) !== '1' || !/redis\.call\('SET', KEYS\[1\], ARGV\[2\]\)/.test(script)) {
    throw new Error(`fake Upstash: only the entitlement compare-and-set EVAL is supported here (got ${name})`);
  }
  const current = store.get(key) ?? '';
  if (current !== expected) return [0, current];
  store.set(key, replacement);
  onStored?.(key);
  return [1, replacement];
}

/** Serve a POSTed command from an http.createServer fake: read the body, reply with the compare-and-set result. */
export function casServe(store, req, res, { onCommand, onStored } = {}) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const command = JSON.parse(body);
      onCommand?.(command);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ result: casReply(store, command, onStored) }));
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: String(err.message) }));
    }
  });
}
