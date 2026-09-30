import { setTimeout as sleep } from "node:timers/promises";
import { config } from "./config.js";
import { processImport } from "./process.js";
import { supabase, type ImportRow } from "./supabase.js";

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, finishing current imports...`);
    stopping = true;
  });
}

async function claimNext(): Promise<ImportRow | null> {
  const { data, error } = await supabase.rpc("claim_next_import");
  if (error) throw error;
  return (data as ImportRow[])[0] ?? null;
}

async function workerLoop(id: number) {
  while (!stopping) {
    let job: ImportRow | null = null;
    try {
      job = await claimNext();
    } catch (error) {
      console.error(`[worker ${id}] could not claim an import:`, error);
    }
    if (job) {
      console.log(`[worker ${id}] processing ${job.kind} import ${job.id} (attempt ${job.attempts})`);
      await processImport(job);
    } else {
      await sleep(config.pollIntervalMs);
    }
  }
}

console.log(`Cookbook worker started with ${config.concurrency} slot(s), model ${config.model}`);
await Promise.all(Array.from({ length: config.concurrency }, (_, i) => workerLoop(i + 1)));
console.log("Worker stopped.");
