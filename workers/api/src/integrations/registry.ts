import type { AdapterFactory, OpenShelfIntegration } from "@openshelf/integration-sdk";
import { PROVIDER_IDS, type ProviderId } from "@openshelf/shared";
import { mockFactories, type MockFactory } from "@openshelf/integration-mock";
import type { JobHandler } from "../outbox";

export type AnyFactory = AdapterFactory<OpenShelfIntegration>;
interface AdapterModule { factory?: AnyFactory; jobHandlers?: Record<string, JobHandler> }

/**
 * ProviderId -> adapter package. Imports are guarded so the worker still boots/typechecks
 * while a package is missing or has no entrypoint yet.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
const loaders: Record<ProviderId, () => Promise<AdapterModule>> = {
  // @ts-ignore package may not exist yet
  iyzico: () => import("@openshelf/integration-iyzico"),
  // @ts-ignore
  trendyol: () => import("@openshelf/integration-trendyol"),
  // @ts-ignore
  geliver: () => import("@openshelf/integration-geliver"),
  // @ts-ignore
  efaturam: () => import("@openshelf/integration-efaturam"),
  // @ts-ignore
  meta: () => import("@openshelf/integration-meta"),
  // @ts-ignore
  ga4: () => import("@openshelf/integration-ga4"),
  // @ts-ignore
  netgsm: () => import("@openshelf/integration-netgsm"),
  // @ts-ignore
  twilio: () => import("@openshelf/integration-twilio"),
  // @ts-ignore
  cf_email: () => import("@openshelf/integration-cf-email"),
};

const overrides = new Map<ProviderId, AnyFactory>();
const loaded = new Map<ProviderId, AdapterModule | null>();

/** Test hook / custom adapters. */
export const registerFactory = (id: ProviderId, f: AnyFactory) => { overrides.set(id, f); };
export const unregisterFactory = (id: ProviderId) => { overrides.delete(id); };

async function load(id: ProviderId): Promise<AdapterModule | null> {
  if (loaded.has(id)) return loaded.get(id)!;
  let mod: AdapterModule | null = null;
  try { mod = (await loaders[id]()) as AdapterModule; } catch { mod = null; }
  loaded.set(id, mod);
  return mod;
}
export async function getFactory(id: ProviderId): Promise<AnyFactory | undefined> {
  return overrides.get(id) ?? (await load(id))?.factory ?? undefined;
}
/** Mock-mode factory: real manifest (when the real package is installed) so admin forms render, mock create() with zero network I/O. */
export async function getMockFactory(id: ProviderId): Promise<MockFactory> {
  const mock = mockFactories[id];
  const real = (overrides.get(id) ?? (await load(id))?.factory)?.manifest;
  return real ? { manifest: real, create: mock.create } : mock;
}
export async function allJobHandlers(): Promise<Record<string, JobHandler>> {
  const out: Record<string, JobHandler> = {};
  for (const id of PROVIDER_IDS) Object.assign(out, (await load(id))?.jobHandlers ?? {});
  return out;
}
export const PAYMENT_PROVIDER_IDS: ProviderId[] = ["iyzico"];
export const SHIPPING_PROVIDER_IDS: ProviderId[] = ["geliver"];
export const INVOICING_PROVIDER_IDS: ProviderId[] = ["efaturam"];
export const SINK_PROVIDER_IDS: ProviderId[] = ["meta", "ga4"];
export const SMS_PROVIDER_IDS: ProviderId[] = ["netgsm", "twilio"];
export const EMAIL_PROVIDER_IDS: ProviderId[] = ["cf_email"];
