import { appPath } from "@agent-native/core/client/api-path";
import {
  callAction,
  useActionQuery,
  writeClientAppState,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { isSaveConflict } from "@agent-native/core/save-conflict";

import "@excalidraw/excalidraw/index.css";
import "./whiteboard-controls.css";
import {
  Excalidraw,
  MainMenu,
  loadFromBlob,
  loadLibraryFromBlob,
  serializeAsJSON,
  CaptureUpdateAction,
  useHandleLibrary,
  exportToBlob,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import {
  boardSchema,
  boardAppStateSchema,
  boardListSchema,
  librarySchema,
  libraryItemsSchema,
  sceneSchema,
  sceneFileIds,
  type BoardScene,
  type LibraryItems,
} from "@shared/whiteboard";
import {
  FilePlus2,
  FolderOpen,
  PencilLine,
  Save,
  ArrowDownUp,
  MessageSquare,
  UserRound,
  House,
  Sun,
  Moon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TAB_ID } from "@/lib/tab-id";
import {
  captureQuestion,
  applyTeachingStep,
  type BrowserTeachingTools,
} from "@/lib/teacher/board";
import { loadBoardFiles, uploadBoardFile } from "@/lib/whiteboard/assets";
import { SaveQueue } from "@/lib/whiteboard/save-queue";

import TeacherPanel from "./TeacherPanel";

window.EXCALIDRAW_ASSET_PATH = appPath("/excalidraw-assets/");
type Draft = { title: string; scene: BoardScene };
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Saving failed. Your drawing is still open.";

export default function BoardEditor({ boardId }: { boardId: string }) {
  const t = useT();
  const boardQuery = useActionQuery("get-board", { id: boardId });
  const libraryQuery = useActionQuery("get-board-library", {});
  const listQuery = useActionQuery("list-boards", {});
  const navigate = useNavigate();
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const editorRoot = useRef<HTMLDivElement>(null);
  const [libraryApi, setLibraryApi] = useState<ExcalidrawImperativeAPI | null>(
    null,
  );
  useHandleLibrary({ excalidrawAPI: libraryApi });
  const boardQueue = useRef<SaveQueue<Draft> | null>(null);
  const libraryQueue = useRef<SaveQueue<LibraryItems> | null>(null);
  const files = useRef<BinaryFiles>({});
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const previousSelection = useRef("");
  const validationError = useRef<string | null>(null);
  const copyId = useRef<string | null>(null);
  const uploaded = useRef(new Set<string>());
  const hydratedRevision = useRef<string | null>(null);
  const mounted = useRef(true);
  const [, repaint] = useState(0);
  const refresh = () => {
    if (mounted.current) repaint((value) => value + 1);
  };
  const [initial, setInitial] = useState<ExcalidrawProps["initialData"]>();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"open" | "rename" | "files" | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = Boolean(
    boardQueue.current?.dirty ||
    libraryQueue.current?.dirty ||
    boardQueue.current?.saving ||
    libraryQueue.current?.saving ||
    validationError.current,
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      Boolean(
        boardQueue.current?.dirty ||
        libraryQueue.current?.dirty ||
        boardQueue.current?.saving ||
        libraryQueue.current?.saving ||
        validationError.current,
      ),
  );
  const boardFailure = boardQueue.current?.error;
  const libraryFailure = libraryQueue.current?.error;
  const conflict =
    isSaveConflict(boardFailure) || isSaveConflict(libraryFailure);

  async function uploadSceneAssets(
    id: string,
    scene: BoardScene,
    known: Set<string>,
  ) {
    for (const fileId of sceneFileIds(scene)) {
      if (known.has(fileId)) continue;
      const file = files.current[fileId];
      if (!file)
        throw new Error(
          "An image is missing. Retry loading or export your drawing before leaving.",
        );
      await uploadBoardFile(id, fileId, file.dataURL);
      known.add(fileId);
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(selectionTimer.current);
      boardQueue.current?.dispose();
      libraryQueue.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (!boardQuery.data || !libraryQuery.data) return;
    const board = boardSchema.parse(boardQuery.data);
    const library = librarySchema.parse(libraryQuery.data);
    if (hydratedRevision.current === board.revision) return;
    if (
      boardQueue.current?.dirty ||
      boardQueue.current?.saving ||
      libraryQueue.current?.dirty ||
      libraryQueue.current?.saving
    )
      return;
    const abort = new AbortController();
    void (async () => {
      const binary = await loadBoardFiles(board, abort.signal);
      const restored = await loadFromBlob(
        new Blob([JSON.stringify({ ...board.scene, files: binary })]),
        null,
        null,
      );
      const items = await loadLibraryFromBlob(
        new Blob([
          JSON.stringify({
            type: "excalidrawlib",
            version: 2,
            libraryItems: library.items,
          }),
        ]),
      );
      if (
        abort.signal.aborted ||
        boardQueue.current?.dirty ||
        boardQueue.current?.saving ||
        libraryQueue.current?.dirty ||
        libraryQueue.current?.saving
      )
        return;
      files.current = restored.files ?? {};
      uploaded.current = new Set(board.assets.map((asset) => asset.fileId));
      const draft = { title: board.title, scene: board.scene };
      if (!boardQueue.current) {
        boardQueue.current = new SaveQueue(
          draft,
          board.revision,
          async (value, revision) => {
            await uploadSceneAssets(boardId, value.scene, uploaded.current);
            const saved = boardSchema.parse(
              await callAction("save-board", {
                id: boardId,
                ...value,
                expectedRevision: revision,
              }),
            );
            hydratedRevision.current = saved.revision;
            return saved.revision;
          },
          refresh,
        );
        libraryQueue.current = new SaveQueue(
          library.items,
          library.revision,
          async (value, revision) =>
            librarySchema.parse(
              await callAction("save-board-library", {
                items: value,
                revision,
              }),
            ).revision,
          refresh,
        );
        setInitial({ ...restored, libraryItems: items });
      } else {
        boardQueue.current.adopt(draft, board.revision);
        libraryQueue.current?.adopt(library.items, library.revision);
        api.current?.addFiles(Object.values(restored.files ?? {}));
        api.current?.updateScene({
          elements: restored.elements,
          appState: restored.appState,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        await api.current?.updateLibrary({ libraryItems: items });
      }
      hydratedRevision.current = board.revision;
      setError(null);
    })().catch((cause) => {
      if (!abort.signal.aborted) setError(message(cause));
    });
    return () => abort.abort();
  }, [boardQuery.data, libraryQuery.data, boardId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        boardQueue.current?.dirty ||
        libraryQueue.current?.dirty ||
        boardQueue.current?.saving ||
        libraryQueue.current?.saving ||
        validationError.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const online = () => {
      if (
        !isSaveConflict(boardQueue.current?.error) &&
        !isSaveConflict(libraryQueue.current?.error)
      )
        void flush().catch((cause) => setError(message(cause)));
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
    };
  }, []);

  // Library-only updates must also reach an otherwise clean editor.
  useEffect(() => {
    if (
      !libraryQuery.data ||
      !api.current ||
      !libraryQueue.current ||
      libraryQueue.current.dirty ||
      libraryQueue.current.saving
    )
      return;
    const library = librarySchema.parse(libraryQuery.data);
    const abort = new AbortController();
    void loadLibraryFromBlob(
      new Blob([
        JSON.stringify({
          type: "excalidrawlib",
          version: 2,
          libraryItems: library.items,
        }),
      ]),
    )
      .then((items) => {
        if (
          abort.signal.aborted ||
          libraryQueue.current?.dirty ||
          libraryQueue.current?.saving
        )
          return;
        libraryQueue.current?.adopt(library.items, library.revision);
        return api.current?.updateLibrary({ libraryItems: items });
      })
      .catch((cause) => setError(message(cause)));
    return () => abort.abort();
  }, [libraryQuery.data]);

  async function flush() {
    if (validationError.current) throw new Error(validationError.current);
    await boardQueue.current?.flush();
    await libraryQueue.current?.flush();
  }
  const teachingTools: BrowserTeachingTools = {
    capture: async () => {
      await flush();
      if (!api.current || !hydratedRevision.current)
        throw new Error("Wait for the drawing to load.");
      return captureQuestion(api.current, hydratedRevision.current);
    },
    apply: async (operation, isActive) => {
      await flush();
      if (!isActive() || !api.current || !boardQueue.current)
        throw new Error("Teacher turn stopped.");
      applyTeachingStep(api.current, operation);
      onChange(
        api.current.getSceneElementsIncludingDeleted(),
        api.current.getAppState(),
        api.current.getFiles(),
      );
      await flush();
      if (!isActive() || !hydratedRevision.current)
        throw new Error("Teacher turn stopped.");
      return hydratedRevision.current;
    },
  };
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(message(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function go(path: string) {
    await flush();
    setDialog(null);
    navigate(path);
  }
  async function newDrawing() {
    await flush();
    const board = await callAction("create-board", {
      requestId: nanoid(),
      title: t("whiteboard.untitled"),
    });
    navigate(`/whiteboard/${board.id}`);
  }
  function download() {
    if (!api.current) return;
    const blob = new Blob(
      [
        serializeAsJSON(
          api.current.getSceneElements(),
          api.current.getAppState(),
          api.current.getFiles(),
          "local",
        ),
      ],
      { type: "application/vnd.excalidraw+json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${boardQueue.current?.value.title ?? "drawing"}.excalidraw`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportImage(format: "png" | "svg") {
    if (!api.current) return;
    const options = {
      elements: api.current.getSceneElements(),
      appState: api.current.getAppState(),
      files: api.current.getFiles(),
    };
    const blob =
      format === "png"
        ? await exportToBlob({ ...options, mimeType: "image/png" })
        : new Blob([(await exportToSvg(options)).outerHTML], {
            type: "image/svg+xml",
          });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${boardQueue.current?.value.title ?? "drawing"}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file: File) {
    if (file.size > 20 * 1024 * 1024)
      throw new Error("Drawing imports must be smaller than 20 MB.");
    const restored = await loadFromBlob(file, null, null);
    // Validate before replacing the canvas; native files may include inline images.
    sceneSchema.parse(
      JSON.parse(
        serializeAsJSON(
          restored.elements ?? [],
          restored.appState ?? {},
          {},
          "local",
        ),
      ),
    );
    await flush();
    if (!api.current) return;
    api.current.addFiles(Object.values(restored.files ?? {}));
    api.current.updateScene({
      elements: restored.elements,
      appState: restored.appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setDialog(null);
  }
  async function saveCopy() {
    const draft = boardQueue.current?.value;
    if (!draft) return;
    const created = boardSchema.parse(
      await callAction("create-board", {
        requestId: copyId.current ?? (copyId.current = nanoid()),
        title: `${draft.title.slice(0, 150)} (copy)`,
      }),
    );
    await uploadSceneAssets(created.id, draft.scene, new Set());
    await callAction("save-board", {
      id: created.id,
      title: created.title,
      scene: draft.scene,
      expectedRevision: created.revision,
    });
    // Preserve the local library too; resolve a separate library conflict explicitly.
    if (libraryQueue.current?.dirty) {
      try {
        await libraryQueue.current.flush();
      } catch {
        throw new Error(
          "Drawing copy saved. Download your local library or load the saved library before switching drawings.",
        );
      }
    }
    boardQueue.current = null;
    navigate(`/whiteboard/${created.id}`);
  }
  const onChange: NonNullable<ExcalidrawProps["onChange"]> = (
    elements,
    appState,
    currentFiles,
  ) => {
    // Excalidraw owns menu dismissal and toggling. Only update presentation when
    // that state changes; pointer/scene changes do not trigger React renders.
    const trigger =
      editorRoot.current?.querySelector<HTMLButtonElement>(
        ".main-menu-trigger",
      );
    const expanded = String(appState.openMenu === "canvas");
    if (trigger && trigger.getAttribute("aria-expanded") !== expanded) {
      trigger.setAttribute("aria-expanded", expanded);
      trigger.setAttribute(
        "aria-label",
        appState.openMenu === "canvas" ? "Close menu" : "Open menu",
      );
      trigger.setAttribute("aria-haspopup", "true");
    }
    files.current = currentFiles;
    const selectedElementIds = Object.keys(appState.selectedElementIds)
      .filter((id) => appState.selectedElementIds[id])
      .slice(0, 200);
    const selection = {
      kind: "whiteboard",
      boardId,
      revision: hydratedRevision.current,
      selectedElementIds,
    };
    const signature = JSON.stringify(selection);
    if (signature !== previousSelection.current) {
      previousSelection.current = signature;
      clearTimeout(selectionTimer.current);
      selectionTimer.current = setTimeout(() => {
        void writeClientAppState(`selection:${TAB_ID}`, selection, {
          requestSource: TAB_ID,
        }).catch(() => {
          previousSelection.current = "";
        });
      }, 300);
    }
    if (!boardQueue.current) return;
    try {
      const serialized: unknown = JSON.parse(
        serializeAsJSON(elements, appState, {}, "local"),
      );
      const scene = sceneSchema.parse(serialized);
      scene.appState = boardAppStateSchema.parse(appState);
      validationError.current = null;
      boardQueue.current.update({
        title: boardQueue.current.value.title,
        scene,
      });
    } catch (cause) {
      validationError.current = message(cause);
      setError(message(cause));
    }
  };
  const onLibraryChange: NonNullable<ExcalidrawProps["onLibraryChange"]> = (
    items,
  ) => {
    try {
      libraryQueue.current?.update(libraryItemsSchema.parse(items));
    } catch (cause) {
      setError(message(cause));
    }
  };
  function downloadLibrary() {
    const blob = new Blob(
      [
        JSON.stringify({
          type: "excalidrawlib",
          version: 2,
          libraryItems: libraryQueue.current?.value ?? [],
        }),
      ],
      { type: "application/vnd.excalidrawlib+json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "library.excalidrawlib";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const failed =
    error ??
    (boardFailure
      ? message(boardFailure)
      : libraryFailure
        ? message(libraryFailure)
        : null) ??
    boardQuery.error?.message ??
    libraryQuery.error?.message;
  if (!initial)
    return (
      <div
        role="status"
        className="flex h-full flex-col items-center justify-center gap-4 p-6"
      >
        {failed ?? t("whiteboard.loading")}
        {failed && (
          <>
            <Button
              onClick={() => {
                hydratedRevision.current = null;
                void boardQuery.refetch();
                void libraryQuery.refetch();
              }}
            >
              {t("whiteboard.retry")}
            </Button>
            <Button variant="outline" onClick={() => navigate("/whiteboard")}>
              {t("whiteboard.open")}
            </Button>
          </>
        )}
      </div>
    );
  const status =
    busy || boardQueue.current?.saving || libraryQueue.current?.saving
      ? t("whiteboard.saving")
      : failed
        ? t("whiteboard.notSaved")
        : dirty
          ? t("whiteboard.unsaved")
          : t("whiteboard.saved");
  return (
    <div ref={editorRoot} className="whiteboard-editor relative h-full w-full">
      <Excalidraw
        initialData={initial}
        excalidrawAPI={(value) => {
          api.current = value;
          setLibraryApi(value);
        }}
        onChange={onChange}
        onLibraryChange={onLibraryChange}
        name={boardQueue.current?.value.title ?? t("whiteboard.untitled")}
        renderTopRightUI={(isMobile, appState) => (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={`board-theme-toggle${isMobile ? " board-theme-toggle--mobile" : ""}`}
            role="switch"
            aria-label="Dark mode"
            aria-checked={appState.theme === "dark"}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter")
                event.stopPropagation();
            }}
            title={
              appState.theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            onClick={() => {
              const editor = api.current;
              if (!editor) return;
              editor.updateScene({
                appState: {
                  theme:
                    editor.getAppState().theme === "dark" ? "light" : "dark",
                },
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            }}
          >
            {appState.theme === "dark" ? (
              <Moon aria-hidden="true" />
            ) : (
              <Sun aria-hidden="true" />
            )}
          </Button>
        )}
        autoFocus
      >
        <MainMenu>
          <MainMenu.Item
            className="board-menu-action board-menu-primary"
            icon={<FilePlus2 aria-hidden="true" />}
            onSelect={() => {
              void perform(newDrawing);
            }}
          >
            {t("whiteboard.new")}
          </MainMenu.Item>
          <MainMenu.Item
            className="board-menu-action"
            icon={<FolderOpen aria-hidden="true" />}
            onSelect={() => setDialog("open")}
          >
            {t("whiteboard.open")}
          </MainMenu.Item>
          <MainMenu.Item
            className="board-menu-action"
            icon={<PencilLine aria-hidden="true" />}
            onSelect={() => {
              setTitle(boardQueue.current?.value.title ?? "");
              setDialog("rename");
            }}
          >
            {t("whiteboard.rename")}
          </MainMenu.Item>
          <MainMenu.Item
            className="board-menu-action"
            icon={<Save aria-hidden="true" />}
            onSelect={() => {
              void perform(flush);
            }}
          >
            {t("whiteboard.saveNow")}
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.Item
            className="board-menu-action"
            icon={<ArrowDownUp aria-hidden="true" />}
            onSelect={() => setDialog("files")}
          >
            {t("whiteboard.files")}
          </MainMenu.Item>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.Item
            className="board-menu-action"
            icon={<MessageSquare aria-hidden="true" />}
            onSelect={() => {
              void perform(() => go("/chat"));
            }}
          >
            {t("whiteboard.chat")}
          </MainMenu.Item>
          <MainMenu.Item
            className="board-menu-action"
            icon={<UserRound aria-hidden="true" />}
            onSelect={() => {
              void perform(() => go("/settings/profile"));
            }}
          >
            {t("whiteboard.account")}
          </MainMenu.Item>
          <MainMenu.Item
            className="board-menu-action"
            icon={<House aria-hidden="true" />}
            onSelect={() => {
              void perform(() => go("/"));
            }}
          >
            {t("whiteboard.home")}
          </MainMenu.Item>
        </MainMenu>
      </Excalidraw>
      <TeacherPanel
        boardTools={teachingTools}
        boardId={boardId}
        suspended={dialog !== null || blocker.state === "blocked"}
      />
      <span
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute bottom-5 left-20 z-10 rounded bg-background px-2 py-1 text-xs text-foreground min-[730px]:left-60"
      >
        {status}
      </span>
      {failed && (
        <div
          role="alert"
          className="absolute bottom-16 left-3 right-3 z-20 flex flex-wrap items-center gap-2 border-2 border-border bg-background p-3 shadow-shadow md:left-auto md:max-w-lg"
        >
          <span className="w-full text-sm">
            {conflict ? t("whiteboard.conflict") : failed}
          </span>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void perform(flush);
            }}
          >
            {t("whiteboard.retrySave")}
          </Button>
          <Button size="sm" variant="outline" onClick={download}>
            {t("whiteboard.download")}
          </Button>
          {Boolean(libraryFailure) && (
            <Button size="sm" variant="outline" onClick={downloadLibrary}>
              {t("whiteboard.downloadLibrary")}
            </Button>
          )}
          {conflict && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  void perform(saveCopy);
                }}
              >
                {t("whiteboard.copy")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  boardQueue.current?.dispose();
                  libraryQueue.current?.dispose();
                  boardQueue.current = null;
                  libraryQueue.current = null;
                  window.location.reload();
                }}
              >
                {t("whiteboard.loadSaved")}
              </Button>
            </>
          )}
        </div>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "rename"
                ? t("whiteboard.rename")
                : dialog === "files"
                  ? t("whiteboard.files")
                  : t("whiteboard.yourDrawings")}
            </DialogTitle>
          </DialogHeader>
          {dialog === "files" ? (
            <div className="flex flex-col gap-3">
              <DialogDescription>
                {t("whiteboard.importDescription")}
              </DialogDescription>
              <Input
                type="file"
                accept=".excalidraw,.json"
                aria-label={t("whiteboard.importFile")}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void perform(() => importFile(file));
                  event.target.value = "";
                }}
              />
              <Button onClick={download}>{t("whiteboard.download")}</Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(() => exportImage("png"));
                }}
              >
                PNG
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(() => exportImage("svg"));
                }}
              >
                SVG
              </Button>
            </div>
          ) : dialog === "rename" ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  const queue = boardQueue.current;
                  if (!queue) return;
                  queue.update({ ...queue.value, title: title.trim() });
                  await queue.flush();
                  setDialog(null);
                });
              }}
            >
              <Input
                aria-label={t("whiteboard.drawingName")}
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
              <Button disabled={busy || !title.trim()} type="submit">
                {t("whiteboard.save")}
              </Button>
            </form>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              {listQuery.error && <p role="alert">{listQuery.error.message}</p>}
              {listQuery.data &&
                boardListSchema.parse(listQuery.data).boards.map((board) => (
                  <button
                    key={board.id}
                    className="block w-full border-b border-border p-3 text-left hover:bg-muted focus-visible:outline-2"
                    disabled={busy}
                    onClick={() => {
                      void perform(() => go(`/whiteboard/${board.id}`));
                    }}
                  >
                    {board.title}
                    {board.id === boardId
                      ? ` · ${t("whiteboard.current")}`
                      : ""}
                  </button>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("whiteboard.leaveTitle")}</DialogTitle>
            <DialogDescription>
              {t("whiteboard.leaveDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                void perform(async () => {
                  await flush();
                  if (blocker.state === "blocked") blocker.proceed();
                });
              }}
            >
              {t("whiteboard.continue")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
              }}
            >
              {t("whiteboard.keepEditing")}
            </Button>
            <Button variant="outline" onClick={download}>
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
