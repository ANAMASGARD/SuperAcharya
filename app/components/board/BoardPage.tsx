import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { APP_TITLE } from "@/lib/app-config";
import { HOME_PATH } from "@/lib/chat-paths";

export default function BoardPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center md:px-8">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {APP_TITLE}
      </p>
      <h1 className="font-head text-3xl tracking-tight md:text-4xl">
        Whiteboard classroom
      </h1>
      <p className="max-w-lg text-base text-muted-foreground">
        Excalidraw, lessons, and live teaching will live here. You are signed in
        and this route is ready for the next build slice.
      </p>
      <Button asChild variant="outline">
        <Link to={HOME_PATH}>App home</Link>
      </Button>
    </div>
  );
}
