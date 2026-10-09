import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { albumValidator } from "./schema";
import { profileFor } from "./profiles";

// Guests can only add photos: there is intentionally no delete/update mutation.

const MAX_BYTES = 25 * 1024 * 1024;

async function requireGuest(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Tenés que ingresar con Google.");
  const profile = await profileFor(ctx, userId);
  if (!profile) throw new ConvexError("Completá tu nombre y apellido primero.");
  return { userId, profile };
}

async function assertImage(ctx: MutationCtx, id: Id<"_storage">) {
  const meta = await ctx.db.system.get(id);
  const ok =
    meta !== null &&
    (meta.contentType ?? "").startsWith("image/") &&
    meta.size <= MAX_BYTES;
  if (!ok) {
    if (meta) await ctx.storage.delete(id);
    throw new ConvexError("Solo se pueden subir imágenes de hasta 25 MB.");
  }
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireGuest(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    album: albumValidator,
    storageId: v.id("_storage"),
    thumbId: v.optional(v.id("_storage")),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await requireGuest(ctx);
    const reused = await ctx.db
      .query("photos")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (reused) throw new ConvexError("Esa foto ya fue subida.");
    await assertImage(ctx, args.storageId);
    if (args.thumbId) await assertImage(ctx, args.thumbId);
    return await ctx.db.insert("photos", {
      album: args.album,
      storageId: args.storageId,
      thumbId: args.thumbId,
      width: Math.max(1, Math.round(args.width)),
      height: Math.max(1, Math.round(args.height)),
      uploaderId: userId,
      uploaderName: `${profile.firstName} ${profile.lastName}`,
    });
  },
});

export const list = query({
  args: { album: albumValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { album, paginationOpts }) => {
    const result = await ctx.db
      .query("photos")
      .withIndex("by_album", (q) => q.eq("album", album))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (p) => {
          const url = await ctx.storage.getUrl(p.storageId);
          const thumbUrl = p.thumbId ? await ctx.storage.getUrl(p.thumbId) : null;
          return {
            _id: p._id,
            _creationTime: p._creationTime,
            width: p.width,
            height: p.height,
            uploaderName: p.uploaderName,
            url,
            thumbUrl: thumbUrl ?? url,
          };
        }),
      ),
    };
  },
});
