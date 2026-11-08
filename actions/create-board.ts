import { defineAction } from "@agent-native/core/action";

import { boardOwner, createBoard } from "../server/lib/whiteboards";
import { boardSchema, createBoardSchema } from "../shared/whiteboard";
export default defineAction({
  description:
    "Create a private blank drawing. Reuse the same Nano ID requestId to retry safely.",
  schema: createBoardSchema,
  outputSchema: boardSchema,
  retrySafe: true,
  link: ({ result }) => ({
    url: `/whiteboard/${result.id}`,
    label: result.title,
  }),
  run: (args, ctx) =>
    createBoard(boardOwner(ctx ?? {}), args.requestId, args.title),
});
