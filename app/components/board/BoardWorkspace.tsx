import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { boardListSchema } from "@shared/whiteboard";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@/components/ui/button";

import BoardEditor from "./BoardEditor";

export default function BoardWorkspace() {
  const t = useT();
  const { boardId } = useParams();
  const navigate = useNavigate();
  const list = useActionQuery("list-boards", {});
  const firstId = useRef(nanoid());
  const starting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (boardId || !list.data || starting.current) return;
    const result = boardListSchema.parse(list.data);
    starting.current = true;
    if (result.latestBoardId) {
      navigate(`/whiteboard/${result.latestBoardId}`, { replace: true });
      starting.current = false;
      return;
    }
    void callAction("create-board", {
      requestId: firstId.current,
      title: t("whiteboard.untitled"),
    })
      .then((board) => {
        navigate(`/whiteboard/${board.id}`, { replace: true });
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not create drawing.",
        ),
      )
      .finally(() => {
        starting.current = false;
      });
  }, [boardId, list.data, navigate]);
  if (boardId) return <BoardEditor key={boardId} boardId={boardId} />;
  const message = error ?? list.error?.message;
  return (
    <div
      role="status"
      className="flex h-full flex-col items-center justify-center gap-4"
    >
      {message ?? t("whiteboard.opening")}
      {message && (
        <Button
          onClick={() => {
            setError(null);
            void list.refetch();
          }}
        >
          {t("whiteboard.retry")}
        </Button>
      )}
    </div>
  );
}
