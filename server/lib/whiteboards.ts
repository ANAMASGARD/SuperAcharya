import { fail, type ActionRunContext } from "@agent-native/core/action";
import {
  saveIfCurrent,
  saveRevisionOf,
  saveConflict,
} from "@agent-native/core/save-conflict/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  boardSchema,
  emptyScene,
  sceneFileIds,
  type BoardScene,
  type LibraryItems,
} from "../../shared/whiteboard";
import { getDb } from "../db";
import {
  boards,
  boardProfiles,
  boardAssets,
  boardLibraries,
} from "../db/schema";

export function boardOwner(
  ctx: Pick<ActionRunContext, "userEmail"> | undefined,
): string {
  if (!ctx?.userEmail)
    fail("Sign in to access your drawings.", {
      errorCode: "unauthorized",
      statusCode: 401,
    });
  return z.email().parse(ctx.userEmail).toLowerCase();
}
export async function ownedBoard(owner: string, id: string) {
  const [board] = await getDb()
    .select()
    .from(boards)
    .where(and(eq(boards.id, id), eq(boards.ownerEmail, owner)));
  if (!board)
    fail("Drawing not found.", { errorCode: "not_found", statusCode: 404 });
  return board;
}
export async function getBoard(owner: string, id: string) {
  const board = await ownedBoard(owner, id);
  const assets = await getDb()
    .select({
      id: boardAssets.id,
      fileId: boardAssets.fileId,
      mimeType: boardAssets.mimeType,
      size: boardAssets.size,
      created: boardAssets.created,
    })
    .from(boardAssets)
    .where(and(eq(boardAssets.boardId, id), eq(boardAssets.ownerEmail, owner)));
  return boardSchema.parse({ ...board, assets });
}
export async function listBoards(owner: string) {
  const db = getDb();
  const [items, profiles] = await Promise.all([
    db
      .select({
        id: boards.id,
        title: boards.title,
        updatedAt: boards.updatedAt,
      })
      .from(boards)
      .where(eq(boards.ownerEmail, owner))
      .orderBy(desc(boards.updatedAt)),
    db
      .select({ latestBoardId: boardProfiles.latestBoardId })
      .from(boardProfiles)
      .where(eq(boardProfiles.ownerEmail, owner)),
  ]);
  const latest = profiles[0]?.latestBoardId;
  return {
    boards: items,
    latestBoardId:
      items.find((item) => item.id === latest)?.id ?? items[0]?.id ?? null,
  };
}
async function setLatest(owner: string, id: string) {
  await getDb()
    .insert(boardProfiles)
    .values({ id: nanoid(), ownerEmail: owner, latestBoardId: id })
    .onConflictDoUpdate({
      target: boardProfiles.ownerEmail,
      set: { latestBoardId: id },
    });
}
export async function createBoard(
  owner: string,
  requestId: string,
  title: string,
) {
  const scene = emptyScene();
  const now = new Date().toISOString();
  await getDb()
    .insert(boards)
    .values({
      id: requestId,
      ownerEmail: owner,
      title,
      scene,
      revision: saveRevisionOf({ title, scene }),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const board = await getBoard(owner, requestId);
  await setLatest(owner, board.id);
  return board;
}
export async function saveBoard(
  owner: string,
  input: {
    id: string;
    title: string;
    scene: BoardScene;
    expectedRevision: string;
  },
) {
  const db = getDb();
  await ownedBoard(owner, input.id);
  const fileIds = sceneFileIds(input.scene);
  if (fileIds.length) {
    const assets = await db
      .select({ fileId: boardAssets.fileId })
      .from(boardAssets)
      .where(
        and(
          eq(boardAssets.boardId, input.id),
          eq(boardAssets.ownerEmail, owner),
          inArray(boardAssets.fileId, fileIds),
        ),
      );
    if (assets.length !== fileIds.length)
      fail(
        "Upload every drawing image before saving. Configure private file storage in Settings if needed.",
        { errorCode: "assets_missing", statusCode: 409 },
      );
  }
  const value = { title: input.title, scene: input.scene };
  const revision = saveRevisionOf(value);
  await saveIfCurrent({
    record: "whiteboard",
    expectedRevision: input.expectedRevision,
    requireRevision: true,
    read: async () => {
      const board = await ownedBoard(owner, input.id);
      return {
        value: { title: board.title, scene: board.scene },
        revision: board.revision,
      };
    },
    isSameSave: (current) => saveRevisionOf(current) === revision,
    write: (current) =>
      db
        .update(boards)
        .set({ ...value, revision, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(boards.id, input.id),
            eq(boards.ownerEmail, owner),
            eq(boards.revision, current.revision),
          ),
        )
        .returning({ id: boards.id }),
  });
  await setLatest(owner, input.id);
  const saved = await getBoard(owner, input.id);
  if (saved.revision !== revision)
    throw saveConflict(
      "whiteboard",
      { title: saved.title, scene: saved.scene },
      saved.revision,
    );
  return saved;
}
export async function getLibrary(owner: string) {
  const [row] = await getDb()
    .select()
    .from(boardLibraries)
    .where(eq(boardLibraries.ownerEmail, owner));
  return {
    items: row?.items ?? [],
    revision: row?.revision ?? saveRevisionOf([]),
  };
}
export async function saveLibrary(
  owner: string,
  items: LibraryItems,
  expectedRevision: string,
) {
  const db = getDb();
  const revision = saveRevisionOf(items);
  await saveIfCurrent({
    record: "whiteboard_library",
    expectedRevision,
    requireRevision: true,
    read: async () => {
      const current = await getLibrary(owner);
      return { value: current.items, revision: current.revision };
    },
    isSameSave: (current) => saveRevisionOf(current) === revision,
    write: async (current) => {
      // Seed once; the following compare-and-set still protects concurrent first saves.
      await db
        .insert(boardLibraries)
        .values({
          id: nanoid(),
          ownerEmail: owner,
          items: [],
          revision: saveRevisionOf([]),
        })
        .onConflictDoNothing();
      return db
        .update(boardLibraries)
        .set({ items, revision, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(boardLibraries.ownerEmail, owner),
            eq(boardLibraries.revision, current.revision),
          ),
        )
        .returning({ id: boardLibraries.id });
    },
  });
  const saved = await getLibrary(owner);
  if (saved.revision !== revision)
    throw saveConflict("whiteboard_library", saved.items, saved.revision);
  return saved;
}
