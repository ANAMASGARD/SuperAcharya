import { Navigate } from "react-router";

import { BOARD_PATH } from "@/lib/chat-paths";

/** Older links used `/board`. The classroom now lives at `/whiteboard`. */
export default function BoardRedirect() {
  return <Navigate to={BOARD_PATH} replace />;
}
