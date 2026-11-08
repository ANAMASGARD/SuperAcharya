import BoardPage from "@/components/board/BoardPage";
import { APP_TITLE } from "@/lib/app-config";

const SEO_DESCRIPTION =
  "Super Acharya whiteboard — learn with a teaching assistant on a shared canvas.";

export function meta() {
  const title = `${APP_TITLE} — Whiteboard`;
  return [
    { title },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: title },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function WhiteboardRoute() {
  return <BoardPage />;
}
