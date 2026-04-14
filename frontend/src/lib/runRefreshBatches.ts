export type RefreshTask = () => Promise<unknown>;

export async function runRefreshBatches(batches: RefreshTask[][]): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = [];

  for (const batch of batches) {
    if (batch.length === 0) {
      continue;
    }

    results.push(...await Promise.allSettled(batch.map((task) => task())));
  }

  return results;
}
