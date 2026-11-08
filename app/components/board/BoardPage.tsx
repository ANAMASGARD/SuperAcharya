import { useT } from "@agent-native/core/client/i18n";
import { ClientOnly } from "@agent-native/toolkit/app/shared";
import { lazy, Suspense } from "react";
const BoardWorkspace = lazy(() => import("./BoardWorkspace"));
export default function BoardPage() {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <ClientOnly fallback={<LoadingBoard />}>
        <Suspense fallback={<LoadingBoard />}>
          <BoardWorkspace />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
function LoadingBoard() {
  const t = useT();
  return (
    <div role="status" className="flex h-full items-center justify-center">
      {t("whiteboard.loading")}
    </div>
  );
}
