// Runs the actual API implementation against Miniflare's real D1/SQLite engine.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { Miniflare } = require('miniflare');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, '.sites-runtime/tests/backup-api.cjs');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await build({ entryPoints: [path.join(root, 'lib/backup-api.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: output });
  const { backupRequest, validateState } = require(output);
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } };', compatibilityDate: '2026-05-01', d1Databases: { DB: 'lexi-api-tests' } });
  let checks = 0;
  const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
  const ok = (value, label) => { assert.ok(value, label); checks++; };
  try {
    const db = await mf.getD1Database('DB');
    const migrations = await fs.readdir(path.join(root, 'drizzle'));
    for (const name of migrations.filter(x => x.endsWith('.sql')).sort()) {
      const migration = await fs.readFile(path.join(root, 'drizzle', name), 'utf8');
      for (const sql of migration.split('--> statement-breakpoint')) if (sql.trim()) await db.prepare(sql.trim()).run();
    }
    const origin = 'https://lexi.test';
    const alice = { userId: 'alice', email: 'alice@example.test' }, bob = { userId: 'bob', email: 'bob@example.test' };
    const empty = () => ({ version: 1, goal: 10, progress: {}, favorites: [], daily: {}, lastTopic: null });
    const state = (seen = 1) => ({ ...empty(), progress: { 'daily-01': { seen, success: seen, interval: 3, due: Date.now() + 86400000 } }, favorites: ['daily-01'], lastTopic: 'daily', daily: { '2026-11-18': { ids: ['daily-01'], xp: 10, correct: 0, answers: 0 } } });
    async function call(method = 'GET', user = alice, body, options = {}) {
      const request = new Request(origin + '/api/backup' + (options.query || ''), { method, headers: { origin, 'content-type': 'application/json', ...options.headers }, ...(method === 'GET' || method === 'HEAD' ? {} : { body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body) }) });
      const response = await backupRequest(request, user, options.noDB ? undefined : db);
      eq(response.headers.get('cache-control'), 'private, no-store', method + ' no-store');
      eq(response.headers.get('vary'), 'Cookie', method + ' auth variance');
      return { status: response.status, body: await response.json() };
    }
    const payload = (revision, value = state(), userId = 'alice') => ({ userId, baseRevision: revision, state: value });
    eq((await call('GET', null)).status, 401, 'anonymous read denied');
    eq((await call('PUT', null, payload(0))).status, 401, 'anonymous write denied');
    eq((await call('GET', alice, undefined, { noDB: true })).status, 503, 'missing DB honest failure');
    eq((await call('GET')).body, { user: { id: 'alice', email: alice.email }, backup: null }, 'new account empty');
    eq((await call('PUT', alice, payload(0), { headers: { origin: 'https://evil.test' } })).status, 403, 'cross-origin denied');
    eq((await call('PUT', alice, payload(0), { headers: { origin: '' } })).status, 403, 'missing origin denied');
    eq((await call('PUT', alice, payload(0), { headers: { 'content-type': 'text/plain' } })).status, 403, 'simple CSRF MIME denied');
    eq((await call('PUT', bob, payload(0))).body.error, 'account_changed', 'cookie switch rejected');
    eq((await call('PUT', alice, { ...payload(0), userId: undefined })).status, 409, 'claimed identity required');
    eq((await call('PUT', alice, payload(-1))).status, 400, 'negative revision denied');
    eq((await call('PUT', alice, payload(0, { ...empty(), version: 2 }))).status, 400, 'wrong schema version');
    eq((await call('PUT', alice, payload(0, { ...empty(), progress: [] }))).status, 400, 'array progress denied');
    eq((await call('PUT', alice, '{')).status, 400, 'malformed JSON');
    eq((await call('PUT', alice)).status, 400, 'missing body is invalid input');
    eq((await call('PUT', alice, ' '.repeat(2_000_001))).status, 413, 'actual bytes size bounded');
    eq((await call('GET', alice, undefined, { query: '?revision=0' })).status, 400, 'invalid historical revision');
    eq((await call('POST', alice, payload(0))).status, 405, 'unsupported method');

    const initial = state();
    let result = await call('PUT', alice, payload(0, initial));
    eq(result.status, 200, 'initial save'); eq(result.body.revision, 1, 'initial revision'); eq(result.body.userId, 'alice', 'ack identity');
    ok(Number.isFinite(Date.parse(result.body.updatedAt)), 'server ack timestamp');
    result = await call();
    eq(result.body.backup.state, validateState(initial), 'complete progress, favorites, daily, goal restored');
    eq((await call('GET', bob)).body.backup, null, 'other account cannot read');
    eq((await call('GET', bob, undefined, { query: '?revision=1&history=1' })).body.history, [], 'other account cannot read history');
    eq((await call('PUT', alice, payload(0))).status, 409, 'stale initial write denied');
    eq((await call('PUT', alice, payload(1, empty()))).body.error, 'empty_replacement', 'empty lost-origin state cannot replace learned cloud');

    // Two requests both read revision 1; exactly one SQLite compare-and-swap must win.
    const races = await Promise.all([call('PUT', alice, payload(1, state(2))), call('PUT', alice, payload(1, state(3)))]);
    eq(races.map(x => x.status).sort(), [200, 409], 'parallel CAS has single winner');
    eq((await call()).body.backup.revision, 2, 'parallel write advances once');
    result = await call('GET', alice, undefined, { query: '?history=1' });
    eq(result.body.history.map(x => x.revision), [2, 1], 'only successful writes enter history');

    const bobState = { ...empty(), goal: 5, favorites: ['food-01'] };
    eq((await call('PUT', bob, payload(0, bobState, 'bob'))).status, 200, 'separate account independently saves');
    for (let rev = 2; rev < 14; rev++) {
      result = await call('PUT', alice, payload(rev, state(rev + 2)));
      eq(result.status, 200, 'history write ' + rev); eq(result.body.revision, rev + 1, 'revision ' + rev);
    }
    result = await call('GET', alice, undefined, { query: '?history=1' });
    eq(result.body.history.length, 10, 'history bounded at ten');
    eq(result.body.history.map(x => x.revision), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5], 'latest ten retained');
    eq((await call('GET', alice, undefined, { query: '?revision=1' })).body.backup, null, 'pruned historical revision gone');
    eq((await call('GET', alice, undefined, { query: '?revision=5' })).body.backup.revision, 5, 'retained revision recoverable');
    eq((await call('GET', bob, undefined, { query: '?history=1' })).body.history.map(x => x.revision), [1], 'pruning does not touch other user');
    eq((await call('GET', bob)).body.backup.state, validateState(bobState), 'other account state stays unchanged');
    const actual = await db.prepare('SELECT COUNT(*) AS n FROM lexi_backup_history').first();
    eq(actual.n, 11, 'real SQLite history rows exactly ten Alice plus one Bob');
    const toeicUser={userId:'toeic-learner',email:'toeic@example.test'},mixed=state(1);
    const ids=require('../lib/lexi-catalog.json').words.filter(id=>id.startsWith('toeic-'));
    for(const id of ids)mixed.progress[id]={seen:2,success:1,interval:1,due:123456};
    mixed.favorites=['daily-01','toeic-400-01','toeic-800-20'];mixed.lastTopic='toeic-800';
    mixed.daily['2026-11-18']={ids:['daily-01','toeic-400-01','toeic-800-20'],xp:30,correct:2,answers:3};
    eq((await call('PUT',toeicUser,payload(0,mixed,toeicUser.userId))).status,200,'new TOEIC IDs save to actual D1');
    eq((await call('GET',toeicUser)).body.backup.state,validateState(mixed),'old and all 100 new word progress recover together');
    eq(Object.keys((await call('GET',toeicUser)).body.backup.state.progress).length,101,'no TOEIC progress stripped');
    eq((await call('PUT',toeicUser,payload(1,state(2),toeicUser.userId))).body.error,'catalog_update_required','old cached client cannot remove TOEIC data');
    eq(Object.keys((await call('GET',toeicUser)).body.backup.state.progress).length,101,'old-client write leaves new progress intact');
    eq((await call('PUT',toeicUser,{...payload(1,mixed,toeicUser.userId),catalogVersion:2})).status,200,'updated client can continue saving TOEIC progress');
    const profileUser={userId:'profile-user',email:'profile@example.test'},profileState=state(2);
    profileState.profile={nickname:'Linh 🌱',avatar:'fox',color:'mint',image:'data:image/jpeg;base64,'+Buffer.from([255,216,255,0,255,217]).toString('base64')};
    eq((await call('PUT',profileUser,{...payload(0,profileState,profileUser.userId),catalogVersion:2,profileVersion:1})).status,200,'profile and avatar save to actual D1');
    eq((await call('GET',profileUser)).body.backup.state,validateState(profileState),'nickname image and progress restore together');
    eq((await call('PUT',profileUser,payload(1,state(3),profileUser.userId))).body.error,'profile_update_required','old cached client cannot erase saved profile');
    eq((await call('GET',profileUser)).body.backup.state.profile,profileState.profile,'profile untouched by old client');
    eq((await call('PUT',profileUser,{...payload(1,{...profileState,profile:{nickname:'Mèo',avatar:'cat',color:'pink',image:null}},profileUser.userId),catalogVersion:2,profileVersion:1})).status,200,'updated client can change avatar');
    eq((await call('GET',profileUser,undefined,{query:'?revision=1'})).body.backup.state.profile,profileState.profile,'history can restore previous avatar and nickname');
    console.log(`PASS: ${checks} assertions against real Miniflare D1/SQLite`);
  } finally { await mf.dispose(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
