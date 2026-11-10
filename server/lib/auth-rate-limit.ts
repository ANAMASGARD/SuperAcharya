import { createHash } from "node:crypto";

import type { BetterAuthOptions } from "better-auth";
import { eq, lt, sql } from "drizzle-orm";

import { getDb } from "../db";
import { authRateLimits } from "../db/schema";

type Storage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

/** Atomic shared counters survive serverless cold starts; no raw IPs retained. */
export const authRateLimitStorage: Storage = {
  async consume(rawKey, rule) {
    const key = createHash("sha256").update(rawKey).digest("hex");
    const now = Date.now();
    const cutoff = now - rule.window * 1000;
    const db = getDb();
    await db
      .delete(authRateLimits)
      .where(lt(authRateLimits.lastRequest, now - 86_400_000));
    const accepted = await db
      .insert(authRateLimits)
      .values({ id: key, key, count: 1, lastRequest: now })
      .onConflictDoUpdate({
        target: authRateLimits.key,
        set: {
          count: sql`CASE WHEN ${authRateLimits.lastRequest} <= ${cutoff} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
          lastRequest: sql`CASE WHEN ${authRateLimits.lastRequest} <= ${cutoff} THEN ${now} ELSE ${authRateLimits.lastRequest} END`,
        },
        setWhere: sql`${authRateLimits.lastRequest} <= ${cutoff} OR ${authRateLimits.count} < ${rule.max}`,
      })
      .returning({ id: authRateLimits.id });
    if (accepted.length) return { allowed: true, retryAfter: null };
    const [record] = await db
      .select({ lastRequest: authRateLimits.lastRequest })
      .from(authRateLimits)
      .where(eq(authRateLimits.key, key));
    return {
      allowed: false,
      retryAfter: Math.max(
        1,
        Math.ceil(
          ((record?.lastRequest ?? now) + rule.window * 1000 - now) / 1000,
        ),
      ),
    };
  },
};
