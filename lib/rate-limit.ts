import { createHash } from "node:crypto";
import { MongoServerError } from "mongodb";
import type { Db } from "mongodb";

export async function consumeRateLimit(database: Db, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const id = createHash("sha256").update(`${key}:${window}`).digest("hex");
  const expiresAt = new Date((window + 2) * windowMs);
  const buckets = database.collection<{ _id: string; count: number; expiresAt: Date }>(
    "rate_limits",
  );
  try {
    await buckets.updateOne(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true },
    );
  } catch (error) {
    // Concurrent first requests can race on the deterministic bucket id.
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    await buckets.updateOne({ _id: id }, { $inc: { count: 1 } });
  }
  const bucket = await buckets.findOne({ _id: id }, { projection: { count: 1 } });
  return {
    allowed: (bucket?.count ?? 0) <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000)),
  };
}

export function requestAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
