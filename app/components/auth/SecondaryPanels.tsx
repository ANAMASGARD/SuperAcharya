import { agentNativePath } from "@agent-native/core/client/api-path";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import {
  FIELD_CLASS,
  OUTLINE_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  TITLE_CLASS,
} from "@/components/auth/auth-styles";
import { NoticeText, type Notice } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authErrorMessage,
  isValidEmail,
  normalizeEmail,
  requestAuth,
} from "@/lib/auth-client";

function PanelHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 text-center">
      <h1 className={TITLE_CLASS}>{title}</h1>
      <p className="text-base text-muted-foreground">{children}</p>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={OUTLINE_BUTTON_CLASS}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to sign in
    </Button>
  );
}

export function ForgotPanel({
  initialEmail,
  onBack,
}: {
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const address = normalizeEmail(email);
    if (!isValidEmail(address)) {
      setNotice({ kind: "error", text: "Enter a valid email address." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await requestAuth(
        "/_agent-native/auth/ba/request-password-reset",
        {
          email: address,
          redirectTo: new URL(
            agentNativePath("/_agent-native/auth/reset"),
            window.location.origin,
          ).href,
        },
      );
      setNotice(
        result.ok
          ? {
              kind: "success",
              text: "Check your inbox. If that email has an account, a reset link is on its way.",
            }
          : {
              kind: "error",
              text: authErrorMessage(
                result.data,
                "We couldn't send a reset link. Try again in a moment.",
              ),
            },
      );
    } catch {
      // coercion-ok: a network failure is reported to the student, not thrown.
      setNotice({
        kind: "error",
        text: "Can't reach the server. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-(--auth-gap)">
      <PanelHeading title="Reset password">
        Enter your email and we'll send you a link to choose a new one.
      </PanelHeading>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-(--auth-gap)"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@school.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <NoticeText notice={notice} />
        <Button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? (
            <LoaderCircle
              className="size-4.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          Send reset link
        </Button>
      </form>
      <BackButton onClick={onBack} />
    </div>
  );
}
