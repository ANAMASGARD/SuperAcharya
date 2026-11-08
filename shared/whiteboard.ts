import { z } from "zod";

export const boardIdSchema = z.string().regex(/^[A-Za-z0-9_-]{21}$/);
export const fileIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const titleSchema = z.string().trim().min(1).max(160);
const finite = z.number().finite();
// Keep the native element representation, including bindings and customData.
// The browser additionally restores imports through Excalidraw's own parser.
export const elementSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.enum([
      "rectangle",
      "diamond",
      "ellipse",
      "text",
      "arrow",
      "line",
      "freedraw",
      "image",
      "frame",
      "magicframe",
      "embeddable",
      "iframe",
      "selection",
    ]),
    x: finite,
    y: finite,
    width: finite.nonnegative(),
    height: finite.nonnegative(),
    version: z.number().int().nonnegative(),
    versionNonce: finite,
    isDeleted: z.boolean(),
    fileId: fileIdSchema.nullable().optional(),
  })
  .catchall(z.json())
  .superRefine((element, ctx) => {
    if (element.type === "text" && typeof element.text !== "string")
      ctx.addIssue({ code: "custom", message: "Text is required" });
    if (
      ["line", "arrow", "freedraw"].includes(element.type) &&
      !z.array(z.tuple([finite, finite])).safeParse(element.points).success
    )
      ctx.addIssue({ code: "custom", message: "Valid points are required" });
    if (element.type === "image" && !element.isDeleted && !element.fileId)
      ctx.addIssue({ code: "custom", message: "An image must have a file ID" });
  });
export const boardAppStateSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  currentItemStrokeColor: z.string().max(100).optional(),
  currentItemBackgroundColor: z.string().max(100).optional(),
  currentItemFillStyle: z
    .enum(["hachure", "cross-hatch", "solid", "zigzag"])
    .optional(),
  currentItemStrokeWidth: finite.nonnegative().optional(),
  currentItemRoughness: finite.nonnegative().optional(),
  currentItemOpacity: finite.min(0).max(100).optional(),
  currentItemFontFamily: finite.optional(),
  currentItemFontSize: finite.positive().optional(),
  viewBackgroundColor: z.string().max(100).optional(),
  gridSize: finite.nullable().optional(),
  gridStep: finite.optional(),
  gridModeEnabled: z.boolean().optional(),
  scrollX: finite.optional(),
  scrollY: finite.optional(),
  zoom: z.object({ value: finite.positive() }).optional(),
});
export const sceneSchema = z
  .object({
    type: z.literal("excalidraw"),
    version: z.literal(2),
    source: z.string().max(512),
    elements: z.array(elementSchema).max(20_000),
    appState: boardAppStateSchema,
  })
  .superRefine((scene, ctx) => {
    if (
      new TextEncoder().encode(JSON.stringify(scene)).byteLength >
      8 * 1024 * 1024
    )
      ctx.addIssue({ code: "custom", message: "Drawing exceeds 8 MB" });
    if (new Set(scene.elements.map((e) => e.id)).size !== scene.elements.length)
      ctx.addIssue({ code: "custom", message: "Duplicate element IDs" });
    if (/"data:[^\"]*;base64,/i.test(JSON.stringify(scene)))
      ctx.addIssue({ code: "custom", message: "Upload files separately" });
  });
export type BoardScene = z.infer<typeof sceneSchema>;
export const emptyScene = (): BoardScene => ({
  type: "excalidraw",
  version: 2,
  source: "Super Acharya",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
});
export const libraryItemsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(128),
      status: z.enum(["published", "unpublished"]),
      created: finite,
      elements: z.array(elementSchema).max(2000),
    }),
  )
  .max(1000)
  .refine(
    (items) =>
      new TextEncoder().encode(JSON.stringify(items)).byteLength <=
      8 * 1024 * 1024,
    "Library exceeds 8 MB",
  )
  .refine(
    (items) => !/"data:[^\"]*;base64,/i.test(JSON.stringify(items)),
    "Upload files separately",
  );
export const librarySchema = z.object({
  items: libraryItemsSchema,
  revision: z.string(),
});
export const assetSchema = z.object({
  id: boardIdSchema,
  fileId: fileIdSchema,
  mimeType: z.string(),
  size: z.number(),
  created: z.number(),
});
export const boardSchema = z.object({
  id: boardIdSchema,
  title: titleSchema,
  scene: sceneSchema,
  revision: z.string(),
  updatedAt: z.string(),
  assets: z.array(assetSchema),
});
export const boardSummarySchema = boardSchema.pick({
  id: true,
  title: true,
  updatedAt: true,
});
export const boardListSchema = z.object({
  boards: z.array(boardSummarySchema),
  latestBoardId: boardIdSchema.nullable(),
});
export const createBoardSchema = z.object({
  requestId: boardIdSchema,
  title: titleSchema.default("Untitled drawing"),
});
export const saveBoardSchema = z.object({
  id: boardIdSchema,
  title: titleSchema,
  scene: sceneSchema,
  expectedRevision: z.string().min(1),
});
export type Board = z.infer<typeof boardSchema>;
export type BoardLibrary = z.infer<typeof librarySchema>;
export type LibraryItems = z.infer<typeof libraryItemsSchema>;
export function sceneFileIds(scene: BoardScene): string[] {
  return [
    ...new Set(
      scene.elements
        .filter((e) => e.type === "image" && e.fileId)
        .map((e) => e.fileId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
}
