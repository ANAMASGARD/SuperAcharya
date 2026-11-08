import { defineAction } from "@agent-native/core/action";

import { boardOwner, saveLibrary } from "../server/lib/whiteboards";
import { librarySchema } from "../shared/whiteboard";
export default defineAction({
  description:
    "Save your Excalidraw library using the last read revision. Preserve other changes on conflict.",
  schema: librarySchema,
  outputSchema: librarySchema,
  retrySafe: true,
  run: (args, ctx) =>
    saveLibrary(boardOwner(ctx ?? {}), args.items, args.revision),
});
