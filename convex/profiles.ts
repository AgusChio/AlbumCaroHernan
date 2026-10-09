import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_NAME = 60;

export async function profileFor(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const profile = await profileFor(ctx, userId);
    return {
      email: user?.email ?? null,
      googleName: user?.name ?? null,
      profile: profile
        ? { firstName: profile.firstName, lastName: profile.lastName }
        : null,
    };
  },
});

function cleanName(value: string, label: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length === 0) throw new ConvexError(`Falta el ${label}.`);
  if (clean.length > MAX_NAME) throw new ConvexError(`El ${label} es demasiado largo.`);
  return clean;
}

/** Only on the first visit: once a guest has a profile it can't be overwritten. */
export const create = mutation({
  args: { firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Tenés que ingresar con Google.");
    const existing = await profileFor(ctx, userId);
    if (existing) return existing._id;
    return await ctx.db.insert("profiles", {
      userId,
      firstName: cleanName(args.firstName, "nombre"),
      lastName: cleanName(args.lastName, "apellido"),
    });
  },
});
