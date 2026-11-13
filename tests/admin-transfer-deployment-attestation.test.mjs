import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/server/admin-transfer-deployment-attestation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
runInNewContext(compiled, { module, exports: module.exports, require, Response, Request, URL, TextDecoder, Buffer, Date });
const { attestAdminTransferDeployment } = module.exports;

const candidate = 'AKfycbFICTIVEdeployment0123456789';
const url = `https://script.google.com/macros/s/${candidate}/exec`;
const digest = createHash('sha256').update(candidate).digest('hex');
const now = Date.parse('2026-11-13T12:00:00Z');
const request = (body = { candidateDigest: digest }, bearer = 'Bearer fake') => new Request('https://ebenezerbusiness.com/api/admin/transferts/deployment-attestation', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: bearer }, body: JSON.stringify(body)
});
const options = (overrides = {}) => ({
  enabled: true, vercelEnvironment: 'production', expiresAt: new Date(now + 5 * 60_000).toISOString(), configuredUrl: url,
  authorize: async req => req.headers.get('Authorization') ? { authorized: true, role: 'ADMIN', userId: 'fake-admin' } : { authorized: false, status: 401 },
  now: () => now, ...overrides
});

for (const [name, overrides] of [
  ['désactivée', { enabled: false }],
  ['hors Production', { vercelEnvironment: 'preview' }],
  ['expirée', { expiresAt: new Date(now - 1).toISOString() }],
  ['fenêtre trop longue', { expiresAt: new Date(now + 16 * 60_000).toISOString() }]
]) test(`route ${name} répond 404`, async () => {
  const response = await attestAdminTransferDeployment(request(), options(overrides));
  assert.equal(response.status, 404);
});

test('ADMIN actif: correspondance, réponse limitée au résultat', async () => {
  const response = await attestAdminTransferDeployment(request(), options());
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { result: 'CORRESPOND' });
  assert.equal(text.includes(candidate), false);
  assert.equal(text.includes(url), false);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});
test('identifiant différent: aucune sélection arbitraire', async () => {
  const otherDigest = createHash('sha256').update('AKfycbOTHERdeployment0123456789').digest('hex');
  const response = await attestAdminTransferDeployment(request({ candidateDigest: otherDigest }), options());
  assert.deepEqual(await response.json(), { result: 'NE_CORRESPOND_PAS' });
});
test('session absente refusée', async () => {
  const response = await attestAdminTransferDeployment(request(undefined, ''), options());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { result: 'INDETERMINABLE' });
});
test('Agent et Admin inactif refusés par le contrôle existant injecté', async () => {
  for (const status of [403, 401]) {
    const response = await attestAdminTransferDeployment(request(), options({ authorize: async () => ({ authorized: false, status }) }));
    assert.equal(response.status, status);
  }
});
test('secret absent, URL étrangère, chemin non canonique: indéterminable', async () => {
  for (const configuredUrl of [undefined, 'https://script.google.com.evil/macros/s/AKfycbFICTIVEdeployment0123456789/exec', 'https://script.google.com/macros/s/AKfycbFICTIVEdeployment0123456789/dev']) {
    const response = await attestAdminTransferDeployment(request(), options({ configuredUrl }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { result: 'INDETERMINABLE' });
  }
});
test('empreinte invalide ou champ supplémentaire: indéterminable', async () => {
  for (const body of [{ candidateDigest: candidate }, { candidateDigest: digest, candidateId: candidate }, {}]) {
    const response = await attestAdminTransferDeployment(request(body), options());
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { result: 'INDETERMINABLE' });
  }
});
test('panne du contrôle Admin: refus sans fuite du secret', async () => {
  const response = await attestAdminTransferDeployment(request(), options({ authorize: async () => { throw Error(url); } }));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes(candidate), false);
});
test('aucune route GET, aucune API métier, aucun journal sensible', () => {
  const route = readFileSync(new URL('../src/app/api/admin/transferts/deployment-attestation/route.ts', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../src/server/admin-transfer-deployment-attestation.ts', import.meta.url), 'utf8');
  assert.match(route, /authorizeAdminRequest/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route + helper, /callTransfertsWriteApi|callTransfertsReadApi|fetch\(|console\.|logger\./);
  assert.match(route, /TRANSFERTS_ADMIN_DEPLOYMENT_ATTESTATION_ENABLED/);
});

test('défense supplémentaire si un résolveur renvoie un rôle Agent', async () => {
  const response = await attestAdminTransferDeployment(request(), options({ authorize: async () => ({ authorized: true, role: 'AGENT', userId: 'fake-agent' }) }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { result: 'INDETERMINABLE' });
});
test('entrée volumineuse refusée avant comparaison', async () => {
  const response = await attestAdminTransferDeployment(request({ candidateDigest: digest, padding: 'x'.repeat(1000) }), options());
  assert.equal(response.status, 400);
});
test('client Admin transmet seulement une empreinte avec authenticatedRead', () => {
  const client = readFileSync(new URL('../src/features/transferts/admin-deployment-attestation-client.ts', import.meta.url), 'utf8');
  assert.match(client, /authenticatedRead/);
  assert.match(client, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(client, /body: JSON\.stringify\(\{ candidateDigest \}\)/);
  assert.doesNotMatch(client, /console\.|transferCode|localStorage|searchParams/);
});

test('déclencheur monté seulement après le contrôle Admin existant, sans appel automatique', () => {
  const page = readFileSync(new URL('../src/app/admin/transferts/page.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/features/transferts/admin-transferts-page.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/features/transferts/admin-deployment-attestation-panel.tsx', import.meta.url), 'utf8');
  assert.match(page, /VERCEL_ENV === "production"/);
  assert.match(page, /TRANSFERTS_ADMIN_DEPLOYMENT_ATTESTATION_ENABLED === "true"/);
  assert.ok(admin.indexOf('if (!authorized)') < admin.indexOf('<AdminDeploymentAttestationTrigger'));
  assert.match(admin, /deploymentAttestationEnabled \? \(/);
  assert.match(panel, /enabled = false/);
  assert.match(panel, /remaining <= 15 \* 60_000/);
  assert.match(panel, /attempted\.current = true/);
  assert.ok(panel.indexOf('async function submit(') < panel.indexOf('attestDeploymentFromAdminSession('));
  assert.equal((panel.match(/attestDeploymentFromAdminSession\(/g) ?? []).length, 1);
  assert.doesNotMatch(page + admin + panel, /TRANSFERTS_PUBLIC_APPS_SCRIPT_URL|candidateDigest|console\./);
});

test('comparaison de la variable effectivement lue par le service de création', () => {
  const route = readFileSync(new URL('../src/app/api/admin/transferts/deployment-attestation/route.ts', import.meta.url), 'utf8');
  const operational = readFileSync(new URL('../src/server/transferts-apps-script.ts', import.meta.url), 'utf8');
  assert.match(route, /configuredUrl: process\.env\.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL/);
  assert.match(operational, /const url = process\.env\.TRANSFERTS_PUBLIC_APPS_SCRIPT_URL\?\.trim\(\)/);
  assert.doesNotMatch(route, /fetch\(|console\.|\.env\.local|vercel env/);
});

test('autorisation serveur réelle: ADMIN actif accepté, Agent et session absente refusés', async () => {
  const authSource = readFileSync(new URL('../src/server/admin-authorization.ts', import.meta.url), 'utf8');
  const authCode = ts.transpileModule(authSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const authModule = { exports: {} };
  const safeRequire = (id) => id === 'server-only' || id === '@supabase/supabase-js' ? {} : require(id);
  runInNewContext(authCode, { module: authModule, exports: authModule.exports, require: safeRequire });
  const { authorizeAdminRequest } = authModule.exports;
  const adminRequest = (bearer) => new Request('https://example.test', {
    headers: bearer ? { Authorization: bearer } : {}
  });
  const identity = (role, actif = true) => ({
    userId: 'fictional-id', email: 'fictional@example.test',
    profile: { id: 'fictional-id', actif, role, agence: 'COO' }
  });
  assert.equal((await authorizeAdminRequest(adminRequest('Bearer fictional'), async () => identity('ADMIN'))).authorized, true);
  assert.equal((await authorizeAdminRequest(adminRequest('Bearer fictional'), async () => identity('AGENT'))).status, 403);
  assert.equal((await authorizeAdminRequest(adminRequest('Bearer fictional'), async () => identity('ADMIN', false))).status, 403);
  assert.equal((await authorizeAdminRequest(adminRequest('Bearer fictional'), async () => null)).status, 401);
  assert.equal((await authorizeAdminRequest(adminRequest(null), async () => { throw Error('must not resolve'); })).status, 401);
});
