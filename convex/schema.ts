import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const albumValidator = v.union(v.literal("iglesia"), v.literal("fiesta"));

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    firstName: v.string(),
    lastName: v.string(),
  }).index("by_user", ["userId"]),

  photos: defineTable({
    album: albumValidator,
    storageId: v.id("_storage"),
    thumbId: v.optional(v.id("_storage")),
    width: v.number(),
    height: v.number(),
    uploaderId: v.id("users"),
    uploaderName: v.string(),
  })
    .index("by_album", ["album"])
    .index("by_storage", ["storageId"]),
});
