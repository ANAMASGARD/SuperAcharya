import { useSession } from "@agent-native/core/client/use-session";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { AuthDialog, type AuthDialogMode } from "@/components/landing/AuthDialog";
import { Button } from "@/components/ui/button";
import { APP_TITLE } from "@/lib/app-config";
import { HOME_PATH } from "@/lib/chat-paths";

export default function LandingPage() {
  const navigate = useNavigate();
  const { status, session } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthDialogMode>("sign-in");

  useEffect(() => {
    if (status === "authenticated" && session) {
      navigate(HOME_PATH, { replace: true });
    }
  }, [status, session, navigate]);

  function openAuth(mode: AuthDialogMode) {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b-2 border-border px-4 py-4 md:px-8">
        <span className="text-sm font-black uppercase tracking-wide">
          {APP_TITLE}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => openAuth("sign-in")}
          >
            Sign in
          </Button>
          <Button type="button" onClick={() => openAuth("sign-up")}>
            Sign up
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16 md:px-8">
        <div className="space-y-4">
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-black leading-tight md:text-5xl">
            Learn with an AI teacher on a shared whiteboard
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Super Acharya helps students ask questions, see steps on the board,
            and learn at their own pace. Sign in to open your classroom.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            size="lg"
            onClick={() => openAuth("sign-up")}
          >
            Get started
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => openAuth("sign-in")}
          >
            I already have an account
          </Button>
        </div>
      </main>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={authMode}
      />
    </div>
  );
}
