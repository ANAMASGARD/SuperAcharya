import { defineAction } from "@agent-native/core/action";
import { readAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

import { boardOwner, getBoard } from "../server/lib/whiteboards";
import { boardIdSchema, elementSchema } from "../shared/whiteboard";
const navigationSchema = z
  .object({
    view: z.string().optional(),
    path: z.string().optional(),
    boardId: boardIdSchema.optional(),
  })
  .catchall(z.json());
const selectionSchema = z.object({
  kind: z.literal("whiteboard"),
  boardId: boardIdSchema,
  revision: z.string().nullable(),
  selectedElementIds: z.array(z.string()).max(200),
});
export default defineAction({
  description:
    "Read current navigation and fresh private drawing details, including selected elements. Unsaved browser edits are not persisted scene data.",
  schema: z.object({}),
  outputSchema: z.object({
    navigation: navigationSchema.nullable(),
    selection: selectionSchema.nullable(),
    board: z
      .object({
        id: boardIdSchema,
        title: z.string(),
        revision: z.string(),
        elementCount: z.number(),
        elements: z.array(elementSchema),
      })
      .optional(),
  }),
  http: false,
  readOnly: true,
  run: async (_, ctx) => {
    const navigation = navigationSchema.safeParse(
      await readAppStateForCurrentTab("navigation"),
    );
    const selection = selectionSchema.safeParse(
      await readAppStateForCurrentTab("selection"),
    );
    const nav = navigation.success ? navigation.data : null;
    const selected =
      selection.success && nav?.boardId === selection.data.boardId
        ? selection.data
        : null;
    if (nav?.view !== "whiteboard" || !nav.boardId)
      return { navigation: nav, selection: null };
    const board = await getBoard(boardOwner(ctx ?? {}), nav.boardId);
    const ids = new Set(selected?.selectedElementIds ?? []);
    return {
      navigation: nav,
      selection: selected,
      board: {
        id: board.id,
        title: board.title,
        revision: board.revision,
        elementCount: board.scene.elements.length,
        elements: (ids.size
          ? board.scene.elements.filter((element) => ids.has(element.id))
          : board.scene.elements
        ).slice(0, 200),
      },
    };
  },
});
