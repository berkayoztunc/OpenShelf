import { mockMessages } from "@openshelf/db";

/** Drizzle D1 database handle (kept loose so this package never depends on the worker's Db type). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockDb = any;
export type MockChannel = "sms" | "email" | "event" | "invoice" | "shipment" | "payment";
export interface MockRecord { channel: MockChannel; to?: string | null; subject?: string | null; body?: string | null; meta?: unknown }

const KEEP = 2000;
/** Writes a "sent" message to mock_messages instead of contacting any external service. Table is capped. */
export async function recordMock(db: MockDb, m: MockRecord): Promise<number | null> {
  const rows = (await db.insert(mockMessages).values({
    channel: m.channel, to: m.to ?? null, subject: m.subject?.slice(0, 300) ?? null, body: m.body?.slice(0, 20000) ?? null, meta: m.meta ?? null,
  }).returning({ id: mockMessages.id })) as { id: number }[];
  const id = rows[0]?.id ?? null;
  if (id !== null && id % 100 === 0) await db.run(`DELETE FROM mock_messages WHERE id <= ${Math.trunc(id) - KEEP}`).catch(() => {});
  return id;
}
