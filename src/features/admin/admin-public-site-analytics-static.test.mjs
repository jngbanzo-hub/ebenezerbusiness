import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/admin/public-site-analytics/route.ts", "utf8");
const serverEntry = readFileSync("src/server/public-site-analytics.ts", "utf8");
const serverCore = readFileSync("src/server/public-site-analytics-core.ts", "utf8");
const server = `${serverEntry}\n${serverCore}`;
const ui = readFileSync("src/features/admin/admin-public-site-analytics.tsx", "utf8");
const workspace = readFileSync("src/features/admin/admin-workspace.tsx", "utf8");
const page = readFileSync("src/app/admin/statistiques-site-public/page.tsx", "utf8");

test("la route est GET uniquement et protégée par l'autorisation Admin", () => {
  assert.match(route, /authorizeAdminRequest\(request\)/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /UNAUTHORIZED/);
  assert.match(route, /FORBIDDEN/);
  assert.match(route, /private, no-store/);
});

test("le token Analytics reste exclusivement côté serveur", () => {
  assert.match(server, /process\.env/);
  assert.match(server, /VERCEL_ANALYTICS_TOKEN/);
  assert.doesNotMatch(server + route + ui, /NEXT_PUBLIC_VERCEL|console\.(?:log|error|warn)/);
  assert.doesNotMatch(ui + workspace, /VERCEL_ANALYTICS_TOKEN|Authorization:\s*`Bearer \$\{config\.token\}`/);
});

test("le bloc expose uniquement des agrégats anonymes et les trois périodes", () => {
  for (const text of [
    "Statistiques du site public",
    "Visiteurs aujourd’hui",
    "Visiteurs sur 7 jours",
    "Visiteurs sur 30 jours",
    "Bénin",
    "RDC",
    "Autres pays",
    "Visites /suivi-de-colis",
    "Recherches colis",
    "QR externe",
    "Mobile",
    "Tablette",
    "Desktop"
  ]) assert.ok(ui.includes(text), text);
  assert.match(workspace, /<AdminPublicSiteAnalytics accessToken=\{accessTokenRef\.current\}/);
  assert.doesNotMatch(ui + server, /trackingCode|tracking_code|qrId|phone|telephone|email|client_name|customer_name/i);
});

test("le lecteur est fail-closed, caché cinq minutes et strictement sans écriture métier", () => {
  assert.match(server, /CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(server, /pending = new Map/);
  assert.match(ui, /Statistiques temporairement indisponibles/);
  assert.doesNotMatch(server + route + ui, /method:\s*["'](?:POST|PUT|PATCH|DELETE)|\.(?:insert|update|upsert|rpc)\s*\(/);
});

test("le KPI suivi utilise la route et jamais tracking_page_view", () => {
  assert.match(server, /requestPath eq '\/suivi-de-colis'/);
  assert.doesNotMatch(server, /tracking_page_view/);
});

test("le dashboard Analytics vit dans un module Admin dédié sans lecture depuis l'accueil", () => {
  assert.match(workspace, /href: "\/admin\/statistiques-site-public"/);
  assert.match(workspace, /Consultez les visites publiques, pays, suivi de colis, QR et appareils\./);
  assert.match(workspace, /module === "public-site-analytics"[\s\S]*?<AdminPublicSiteAnalytics accessToken=\{accessTokenRef\.current\}/);
  const homeBlock = workspace.match(/\{module === "home" \? \([\s\S]*?\) : null\}/)?.[0] ?? "";
  assert.doesNotMatch(homeBlock, /AdminPublicSiteAnalytics/);
  assert.match(page, /<AdminWorkspace module="public-site-analytics" \/>/);
  assert.match(page, /noIndex: true/);
});
