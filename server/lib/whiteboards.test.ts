import {
  closeDbExec,
  getDbExec,
  withMigrationRuntime,
} from "@agent-native/core/db";
import {
  registerPrivateBlobProvider,
  unregisterPrivateBlobProvider,
  type PrivateBlobHandle,
  type PrivateBlobReadResult,
} from "@agent-native/core/private-blob";
import { nanoid } from "nanoid";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import {
  emptyScene,
  sceneSchema,
  boardAppStateSchema,
  libraryItemsSchema,
} from "../../shared/whiteboard";
import { boardMigrations } from "../db/migrations";
import { validateImage, readBoardAsset, storeBoardAsset } from "./board-assets";
import {
  createBoard,
  getBoard,
  listBoards,
  saveBoard,
  getLibrary,
  saveLibrary,
  boardOwner,
} from "./whiteboards";

beforeAll(async () => {
  await withMigrationRuntime(async () => {
    for (const migration of boardMigrations) {
      if (typeof migration.sql === "string")
        for (const statement of migration.sql
          .split(";")
          .filter((s) => s.trim()))
          await getDbExec().execute({ sql: statement });
    }
  });
});
afterAll(() => closeDbExec());
const alice = "alice@example.test",
  bob = "bob@example.test";
describe("private drawings", () => {
  it("requires authenticated context", () =>
    expect(() => boardOwner(undefined)).toThrow("Sign in"));
  it("creates idempotently and isolates lists, reads, writes and files", async () => {
    const id = nanoid();
    const board = await createBoard(alice, id, "Algebra");
    expect((await createBoard(alice, id, "Retry")).title).toBe("Algebra");
    expect(
      (await listBoards(alice)).boards.filter((b) => b.id === id),
    ).toHaveLength(1);
    expect((await listBoards(bob)).boards).toHaveLength(0);
    await expect(getBoard(bob, id)).rejects.toThrow("not found");
    await expect(
      saveBoard(bob, { ...board, expectedRevision: board.revision }),
    ).rejects.toThrow("not found");
    await expect(readBoardAsset(bob, id, "image")).rejects.toThrow("not found");
  });
  it("round-trips scene metadata, rejects stale saves, accepts exact retries", async () => {
    const board = await createBoard(alice, nanoid(), "Geometry");
    const scene = sceneSchema.parse({
      ...emptyScene(),
      elements: [
        {
          id: "rect",
          type: "rectangle",
          x: 1,
          y: 2,
          width: 50,
          height: 60,
          version: 1,
          versionNonce: 7,
          isDeleted: false,
          groupIds: ["group"],
          customData: { latex: "x^2", stepId: "step" },
        },
      ],
    });
    const saved = await saveBoard(alice, {
      id: board.id,
      title: board.title,
      scene,
      expectedRevision: board.revision,
    });
    expect(saved.scene).toEqual(scene);
    expect(
      (
        await saveBoard(alice, {
          id: board.id,
          title: board.title,
          scene,
          expectedRevision: board.revision,
        })
      ).revision,
    ).toBe(saved.revision);
    await expect(
      saveBoard(alice, {
        id: board.id,
        title: "Stale",
        scene: emptyScene(),
        expectedRevision: board.revision,
      }),
    ).rejects.toMatchObject({ errorCode: "save_conflict" });
    expect((await getBoard(alice, board.id)).scene).toEqual(scene);
  });
  it("allows only one of two competing writes", async () => {
    const board = await createBoard(alice, nanoid(), "Race");
    const results = await Promise.allSettled(
      ["A", "B"].map((title) =>
        saveBoard(alice, {
          id: board.id,
          title,
          scene: board.scene,
          expectedRevision: board.revision,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("refuses a scene whose images are not durable", async () => {
    const board = await createBoard(alice, nanoid(), "Images");
    const scene = sceneSchema.parse({
      ...emptyScene(),
      elements: [
        {
          id: "image",
          type: "image",
          fileId: "missing",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
        },
      ],
    });
    await expect(
      saveBoard(alice, {
        id: board.id,
        title: board.title,
        scene,
        expectedRevision: board.revision,
      }),
    ).rejects.toMatchObject({ errorCode: "assets_missing" });
    expect((await getBoard(alice, board.id)).scene.elements).toHaveLength(0);
  });
  it("persists personal libraries and rejects conflicting edits", async () => {
    const initial = await getLibrary(alice);
    const items = [
      {
        id: "library-item",
        status: "unpublished" as const,
        created: 1,
        elements: [],
      },
    ];
    const saved = await saveLibrary(alice, items, initial.revision);
    expect(saved.items).toEqual(items);
    expect((await getLibrary(bob)).items).toEqual([]);
    await expect(
      saveLibrary(alice, [], initial.revision),
    ).rejects.toMatchObject({ errorCode: "save_conflict" });
  });
  it("round-trips image bytes through private references without storing them in scenes", async () => {
    const blobs = new Map<string, PrivateBlobReadResult>();
    registerPrivateBlobProvider({
      id: "whiteboard-test-memory",
      name: "Test-only memory provider",
      isConfigured: () => true,
      put: async (input) => {
        const handle: PrivateBlobHandle = {
          id: nanoid(),
          provider: "whiteboard-test-memory",
          opaque: true,
          encrypted: false,
        };
        blobs.set(handle.id, {
          data: new Uint8Array(input.data),
          mimeType: input.mimeType ?? "image/png",
          handle,
        });
        return handle;
      },
      read: async (handle) => {
        const result = blobs.get(handle.id);
        if (!result) throw new Error("Missing test blob");
        return result;
      },
      delete: async (handle) => ({
        deleted: blobs.delete(handle.id),
        provider: handle.provider,
      }),
    });
    try {
      const board = await createBoard(alice, nanoid(), "Image round trip");
      const image = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
        "base64",
      );
      const asset = await storeBoardAsset(
        alice,
        board.id,
        "file-1",
        image,
        "image/png",
      );
      expect(
        (await storeBoardAsset(alice, board.id, "file-1", image, "image/png"))
          .id,
      ).toBe(asset.id);
      const scene = sceneSchema.parse({
        ...emptyScene(),
        elements: [
          {
            id: "image",
            type: "image",
            fileId: "file-1",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            version: 1,
            versionNonce: 1,
            isDeleted: false,
          },
        ],
      });
      const saved = await saveBoard(alice, {
        id: board.id,
        title: board.title,
        scene,
        expectedRevision: board.revision,
      });
      expect(saved.assets[0]?.fileId).toBe("file-1");
      expect(JSON.stringify(saved)).not.toContain("base64");
      expect((await readBoardAsset(alice, board.id, "file-1")).data).toEqual(
        image,
      );
      await expect(readBoardAsset(bob, board.id, "file-1")).rejects.toThrow(
        "not found",
      );
    } finally {
      unregisterPrivateBlobProvider("whiteboard-test-memory");
    }
  });
  it("validates untrusted scenes and raster signatures", () => {
    expect(
      boardAppStateSchema.parse({
        theme: "dark",
        scrollX: 12,
        zoom: { value: 1.5 },
        selectedElementIds: { private: true },
        collaborators: {},
        openDialog: "export",
        draggingElement: { id: "transient" },
      }),
    ).toEqual({ theme: "dark", scrollX: 12, zoom: { value: 1.5 } });
    expect(
      libraryItemsSchema.safeParse([
        {
          id: "item",
          status: "unpublished",
          created: 1,
          elements: [
            {
              id: "rect",
              type: "rectangle",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              version: 1,
              versionNonce: 1,
              isDeleted: false,
              customData: { image: "data:image/png;base64,secret" },
            },
          ],
        },
      ]).success,
    ).toBe(false);
    expect(
      sceneSchema.safeParse({ ...emptyScene(), elements: [{ type: "script" }] })
        .success,
    ).toBe(false);
    expect(
      sceneSchema.safeParse({
        ...emptyScene(),
        appState: { viewBackgroundColor: "data:image/png;base64,secret" },
      }).success,
    ).toBe(false);
    expect(() =>
      validateImage(
        new TextEncoder().encode("<svg onload='bad()' />"),
        "image/png",
      ),
    ).toThrow();
  });
});
