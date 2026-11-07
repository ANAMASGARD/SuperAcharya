import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_TITLE } from "@/lib/app-config";
import { NEW_CHAT_PATH } from "@/lib/chat-paths";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {APP_TITLE}
        </p>
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-black tracking-tight md:text-4xl">
          Your classroom
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Learn on a shared whiteboard with a patient AI teacher. The board and
          lesson flows are coming next; this is your signed-in app home—not the
          starter chat template.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-2 border-border shadow-shadow">
          <CardHeader>
            <CardTitle>Whiteboard</CardTitle>
            <CardDescription>
              Excalidraw classroom, saved lessons, and step-by-step teaching.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="secondary" disabled className="w-full">
              Coming soon
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-border shadow-shadow">
          <CardHeader>
            <CardTitle>Agent</CardTitle>
            <CardDescription>
              Optional assistant for builds and settings—not the main landing
              experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default" className="w-full">
              <Link to={NEW_CHAT_PATH}>Open chat</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
