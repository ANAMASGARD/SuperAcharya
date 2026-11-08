import { createHash } from "node:crypto";

import { fail } from "@agent-native/core/action";
import {
  mintAttachmentRef,
  resolveAttachment,
  unwrapAttachment,
} from "@agent-native/core/private-blob";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "../db";
import { boardAssets } from "../db/schema";
import { ownedBoard } from "./whiteboards";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export function validateImage(data: Uint8Array, mimeType: string) {
  if (!data.length || data.length > MAX_IMAGE_BYTES)
    fail("Images must be smaller than 10 MB.", {
      errorCode: "invalid_image",
      statusCode: 413,
    });
  const bytes = Buffer.from(data);
  const valid =
    mimeType === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : mimeType === "image/gif"
          ? ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())
          : mimeType === "image/webp"
            ? bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            : false;
  if (!valid)
    fail(
      "Use a valid PNG, JPEG, GIF or WebP image. SVG images are converted to PNG in the editor.",
      { errorCode: "invalid_image", statusCode: 415 },
    );
}
export async function storeBoardAsset(
  owner: string,
  boardId: string,
  fileId: string,
  data: Uint8Array,
  mimeType: string,
) {
  await ownedBoard(owner, boardId);
  validateImage(data, mimeType);
  const db = getDb();
  const digest = createHash("sha256").update(data).digest("hex");
  const where = and(
    eq(boardAssets.boardId, boardId),
    eq(boardAssets.ownerEmail, owner),
    eq(boardAssets.fileId, fileId),
  );
  const [existing] = await db.select().from(boardAssets).where(where);
  if (existing) {
    if (existing.digest !== digest)
      fail("This file ID already belongs to another image.", {
        errorCode: "asset_conflict",
        statusCode: 409,
      });
    return existing;
  }
  const minted = await mintAttachmentRef({
    data,
    filename: fileId,
    mimeType,
    ownerEmail: owner,
    orgId: null,
  });
  if (minted.status !== "ok")
    fail(
      "Private image storage is unavailable. Configure file storage in Settings, then retry saving. Your drawing is still open.",
      { errorCode: "storage_unavailable", statusCode: 503 },
    );
  await db
    .insert(boardAssets)
    .values({
      id: nanoid(),
      boardId,
      ownerEmail: owner,
      fileId,
      attachmentRef: minted.ref,
      mimeType,
      size: data.length,
      created: Date.now(),
      digest,
    })
    .onConflictDoNothing();
  const [saved] = await db.select().from(boardAssets).where(where);
  if (!saved || saved.digest !== digest)
    fail("Image upload conflicted. Retry with a new file ID.", {
      errorCode: "asset_conflict",
      statusCode: 409,
    });
  return saved;
}
export async function readBoardAsset(
  owner: string,
  boardId: string,
  fileId: string,
) {
  await ownedBoard(owner, boardId);
  const [asset] = await getDb()
    .select()
    .from(boardAssets)
    .where(
      and(
        eq(boardAssets.boardId, boardId),
        eq(boardAssets.ownerEmail, owner),
        eq(boardAssets.fileId, fileId),
      ),
    );
  if (!asset)
    fail("Image not found.", { errorCode: "not_found", statusCode: 404 });
  return unwrapAttachment(
    await resolveAttachment(asset.attachmentRef, {
      ownerEmail: owner,
      orgId: null,
    }),
  );
}
