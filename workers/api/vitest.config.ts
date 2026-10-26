import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
// Integration packages are built by other agents: alias missing ones to an empty stub so tests never depend on them.
const stub = path.resolve(__dirname, "test/stubs/empty.ts");
const alias: Record<string, string> = {};
// trendyol is NOT stubbed: the API console route imports its catalog/console code from the real package.
for (const id of ["iyzico", "geliver", "efaturam", "meta", "ga4"]) {
  // Tests inject fakes via registerFactory(); always stub to keep the suite hermetic.
  if (!existsSync(path.join(root, `packages/integrations/${id}/src/index.ts`)) || process.env.OS_TEST_STUB_ADAPTERS !== "0") alias[`@openshelf/integration-${id}`] = stub;
}

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    resolve: { alias },
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      testTimeout: 30000,
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: false,
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
              SETUP_TOKEN: "test-setup-token-123",
              ALLOW_MOCK: "true",
              ADMIN_ORIGIN: "http://admin.test",
              STOREFRONT_ORIGIN: "http://shop.test",
              API_ORIGIN: "http://api.test",
            },
          },
        },
      },
    },
  };
});
