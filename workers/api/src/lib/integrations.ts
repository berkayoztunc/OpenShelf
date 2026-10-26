import { eq } from "drizzle-orm";
import { integrationConfigs, integrationEvents, storeSettings } from "@openshelf/db";
import { mockFactories, noNetworkFetch, type MockDeps } from "@openshelf/integration-mock";
import type { AdapterDeps, IntegrationCredentials, OpenShelfIntegration, IntegrationManifest } from "@openshelf/integration-sdk";
import { PROVIDER_IDS, SystemSettings, type ProviderId } from "@openshelf/shared";
import type { Db, Env } from "../env";
import { decryptJson, encryptJson, toBytes } from "./crypto";
import { getFactory, getMockFactory } from "../integrations/registry";
import { ApiError } from "./http";
import { scrub } from "./log";

const secretsAad = (provider: string) => `integration:${provider}`;
export const isProvider = (p: string): p is ProviderId => (PROVIDER_IDS as readonly string[]).includes(p);

export async function loadSecrets(env: Env, row: typeof integrationConfigs.$inferSelect | undefined): Promise<Record<string, string>> {
  if (!row?.secretsEnc || !row.secretsIv) return {};
  return decryptJson<Record<string, string>>(env, toBytes(row.secretsEnc), toBytes(row.secretsIv), row.keyVersion, secretsAad(row.provider));
}
export const mask = (v: string) => "••••" + (v.length > 4 ? v.slice(-4) : "");

const httpsOnlyFetch: AdapterDeps["fetch"] = (input, init) => {
  if (!/^https:\/\//i.test(input)) throw new Error("Only https outbound calls are allowed");
  return fetch(input, init);
};
export const adapterDeps = (): AdapterDeps => ({ fetch: httpsOnlyFetch, now: () => new Date() });

/** Always a fresh (uncached) D1 read: toggling mock mode OFF must take effect immediately on every isolate. */
export const isMockMode = (db: Db): Promise<boolean> => isMockModeFresh(db);
/** Uncached read straight from D1: used by /mock/* routes and mock signature verification so turning mock off is immediate. */
export async function isMockModeFresh(db: Db): Promise<boolean> {
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.group, "system")).limit(1);
  return SystemSettings.safeParse(row?.value ?? {}).data?.mockMode === true;
}
export const mockDeps = (env: Env, db: Db): MockDeps => ({
  fetch: noNetworkFetch, now: () => new Date(), db, apiOrigin: env.API_ORIGIN, encryptionKey: env.APP_ENCRYPTION_KEY, isMockMode: () => isMockModeFresh(db),
});
/**
 * Single "is this provider on?" check. Mock mode => every provider is enabled and no secrets are required or read.
 * Otherwise: integration_configs.enabled.
 */
export async function isIntegrationEnabled(env: Env, db: Db, provider: ProviderId): Promise<boolean> {
  void env;
  if (await isMockMode(db)) return true;
  const [row] = await db.select({ enabled: integrationConfigs.enabled }).from(integrationConfigs).where(eq(integrationConfigs.provider, provider)).limit(1);
  return row?.enabled === true;
}

export async function listIntegrations(env: Env, db: Db) {
  const mock = await isMockMode(db);
  const rows = await db.select().from(integrationConfigs);
  const byId = new Map(rows.map((r) => [r.provider, r]));
  const out = [];
  for (const id of PROVIDER_IDS) {
    const f = mock ? await getMockFactory(id) : await getFactory(id);
    const m = f?.manifest;
    const row = byId.get(id);
    // Real secrets are never decrypted in mock mode.
    const secrets = mock ? ({} as Record<string, string>) : await loadSecrets(env, row).catch(() => ({}) as Record<string, string>);
    const keys = (m?.secretFields ?? []).map((s) => s.key);
    out.push({
      provider: id, name: m?.name ?? id, description: m?.description ?? "", docsUrl: m?.docsUrl, available: !!f,
      mock, enabled: mock ? true : row?.enabled ?? false, configPublic: (row?.configPublic as Record<string, unknown>) ?? {},
      secretsSet: Object.fromEntries(keys.map((k) => [k, !!secrets[k]])),
      secretsMasked: Object.fromEntries(keys.filter((k) => secrets[k]).map((k) => [k, mask(secrets[k]!)])),
      health: row?.lastHealthAt ? { ok: !!row.lastHealthOk, detail: row.lastHealthDetail ?? "", at: row.lastHealthAt.toISOString() } : null,
      publicFields: m?.publicFields ?? [], secretFields: m?.secretFields ?? [],
    });
  }
  return out;
}

export async function saveIntegration(env: Env, db: Db, provider: ProviderId, input: { enabled: boolean; config: Record<string, unknown>; secrets?: Record<string, string | null> }, adminId: string) {
  if (await isMockMode(db)) throw new ApiError(409, "mock_mode_active", "Mock mode is on: turn it off in Settings > System to change real integrations");
  const factory = await getFactory(provider);
  if (!factory) throw new ApiError(404, "integration_unavailable", `Adapter for ${provider} is not installed`);
  const manifest: IntegrationManifest = factory.manifest;
  const [row] = await db.select().from(integrationConfigs).where(eq(integrationConfigs.provider, provider)).limit(1);
  const existing = await loadSecrets(env, row);
  const allowed = new Set(manifest.secretFields.map((s) => s.key));
  const merged = { ...existing };
  for (const [k, v] of Object.entries(input.secrets ?? {})) {
    if (!allowed.has(k)) throw new ApiError(400, "unknown_secret", `Unknown secret field: ${k}`);
    if (v === null) delete merged[k];
    else if (v !== "") merged[k] = v;
  }
  if (input.enabled) {
    const r = manifest.schema.safeParse({ config: input.config, secrets: merged });
    if (!r.success) throw new ApiError(400, "validation_error", "Invalid integration configuration", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  let secretsEnc: Buffer | null = null; let secretsIv: Buffer | null = null;
  if (Object.keys(merged).length) {
    const e = await encryptJson(env, merged, secretsAad(provider));
    secretsEnc = Buffer.from(e.ciphertext); secretsIv = Buffer.from(e.iv);
  }
  const values = { enabled: input.enabled, configPublic: input.config, secretsEnc, secretsIv, keyVersion: 1, updatedBy: adminId, updatedAt: new Date() };
  await db.insert(integrationConfigs).values({ provider, ...values }).onConflictDoUpdate({ target: integrationConfigs.provider, set: values });
}

/** Build an adapter from stored config. `requireEnabled=false` is used by the test endpoint. */
export async function getAdapter<T extends OpenShelfIntegration = OpenShelfIntegration>(env: Env, db: Db, provider: ProviderId, requireEnabled = true): Promise<{ adapter: T; config: Record<string, unknown>; secrets: Record<string, string> } | null> {
  if (await isMockMode(db)) {
    // Mock mode: always available; only public config is read (secret columns are never selected) and the network is unreachable.
    const [m] = await db.select({ configPublic: integrationConfigs.configPublic }).from(integrationConfigs).where(eq(integrationConfigs.provider, provider)).limit(1);
    const config = (m?.configPublic as Record<string, unknown> | undefined) ?? {};
    return { adapter: mockFactories[provider].create({ config, secrets: {} }, mockDeps(env, db)) as T, config, secrets: {} };
  }
  const [row] = await db.select().from(integrationConfigs).where(eq(integrationConfigs.provider, provider)).limit(1);
  if (!row || (requireEnabled && !row.enabled)) return null;
  const factory = await getFactory(provider);
  if (!factory) return null;
  const secrets = await loadSecrets(env, row);
  const config = (row.configPublic as Record<string, unknown>) ?? {};
  const creds: IntegrationCredentials = { config, secrets };
  return { adapter: factory.create(creds, adapterDeps()) as T, config, secrets };
}

export async function testIntegration(env: Env, db: Db, provider: ProviderId): Promise<{ ok: boolean; detail: string }> {
  let ok = false; let detail = "";
  const a = await getAdapter(env, db, provider, false).catch((e: unknown) => { detail = e instanceof Error ? e.message : "decrypt failed"; return null; });
  if (!a) detail ||= "Integration is not configured";
  else {
    try {
      await a.adapter.validateConfig();
      const h = await a.adapter.healthCheck();
      ok = h.ok; detail = h.detail ?? (h.ok ? "OK" : "Health check failed");
    } catch (e) { detail = scrub(e instanceof Error ? e.message : "error", Object.values(a.secrets)); }
  }
  detail = scrub(detail, a ? Object.values(a.secrets) : []);
  if (a && (await isMockMode(db))) return { ok, detail: `Mock mode: ${detail}` };
  const now = new Date();
  await db.update(integrationConfigs).set({ lastHealthOk: ok, lastHealthDetail: detail, lastHealthAt: now }).where(eq(integrationConfigs.provider, provider));
  if (!ok) await logIntegrationEvent(db, provider, "warn", `Health check failed: ${detail}`);
  return { ok, detail };
}

export async function logIntegrationEvent(db: Db, provider: string, level: "info" | "warn" | "error", message: string, meta?: unknown) {
  await db.insert(integrationEvents).values({ provider, level, message: message.slice(0, 1000), meta: (meta as object) ?? null });
}
