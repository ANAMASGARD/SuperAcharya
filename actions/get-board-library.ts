import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { boardOwner, getLibrary } from "../server/lib/whiteboards";
import { librarySchema } from "../shared/whiteboard";
export default defineAction({
  description: "Read your personal Excalidraw shape library and revision.",
  schema: z.object({}),
  outputSchema: librarySchema,
  http: { method: "GET" },
  run: (_, ctx) => getLibrary(boardOwner(ctx ?? {})),
});
