export interface BulkFailure { id: string; message: string }
export interface BulkResult { ok: string[]; failed: BulkFailure[] }

/** Runs `fn` for every id with limited concurrency; never throws, collects per-item failures. */
export async function runBulk(ids: string[], fn: (id: string) => Promise<unknown>, describe: (e: unknown) => string, onProgress?: (done: number, total: number) => void, concurrency = 3): Promise<BulkResult> {
  const res: BulkResult = { ok: [], failed: [] };
  let next = 0; let done = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]!;
      try { await fn(id); res.ok.push(id); } catch (e) { res.failed.push({ id, message: describe(e) }); }
      onProgress?.(++done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return res;
}
