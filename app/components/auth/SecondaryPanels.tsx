import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

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
  enterApp,
  isEmailNotVerified,
  isValidEmail,
  normalizeEmail,
  requestAuth,
  resolveResumeHref,
} from "@/lib/auth-client";

const RESEND_COOLDOWN_SECONDS = 60;

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
        { email: address },
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
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-(--auth-gap)">
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
            <LoaderCircle className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          Send reset link
        </Button>
      </form>
      <BackButton onClick={onBack} />
    </div>
  );
}

export function VerifyEmailPanel({
  email,
  password,
  onBack,
}: {
  email: string;
  password: string;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<Notice | null>({
    kind: "success",
    text: `We sent a verification link to ${email}.`,
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function continueAfterVerifying() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    let leavingPage = false;
    try {
      const login = await requestAuth("/_agent-native/auth/login", {
        email,
        password,
      });
      if (login.ok) {
        leavingPage = true;
        enterApp(resolveResumeHref(window.location.search));
        return;
      }
      setNotice({
        kind: "error",
        text: isEmailNotVerified(login)
          ? "Still waiting for verification. Open the link in the email, then try again."
          : authErrorMessage(login.data, "We couldn't sign you in. Go back and try again."),
      });
    } catch {
      // coercion-ok: a network failure is reported to the student, not thrown.
      setNotice({
        kind: "error",
        text: "Can't reach the server. Check your connection and try again.",
      });
    } finally {
      if (!leavingPage) setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setNotice(null);
    try {
      const result = await requestAuth(
        "/_agent-native/auth/ba/send-verification-email",
        { email, callbackURL: resolveResumeHref(window.location.search) },
      );
      if (result.ok) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setNotice({ kind: "success", text: "Sent again. Check your inbox." });
        return;
      }
      setNotice({
        kind: "error",
        text: authErrorMessage(result.data, "We couldn't resend the email. Try again in a moment."),
      });
    } catch {
      // coercion-ok: a network failure is reported to the student, not thrown.
      setNotice({
        kind: "error",
        text: "Can't reach the server. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-(--auth-gap)">
      <PanelHeading title="Verify your email">
        Open the link we emailed you, then come back and continue.
      </PanelHeading>
      <NoticeText notice={notice} />
      <Button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void continueAfterVerifying()}
        className={PRIMARY_BUTTON_CLASS}
      >
        {busy ? (
          <LoaderCircle className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        I've verified my email
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={cooldown > 0}
        onClick={() => void resend()}
        className={OUTLINE_BUTTON_CLASS}
      >
        {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
      </Button>
      <BackButton onClick={onBack} />
    </div>
  );
}

export function TwoFactorPanel({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = code.trim();
    if (!/^\d{6,8}$/.test(trimmed)) {
      setNotice({ kind: "error", text: "Enter the 6 to 8 digit code from your authenticator app." });
      return;
    }
    setBusy(true);
    setNotice(null);
    let leavingPage = false;
    try {
      const result = await requestAuth("/_agent-native/auth/two-factor/verify", {
        code: trimmed,
      });
      if (result.ok && result.data.ok === true) {
        leavingPage = true;
        enterApp(resolveResumeHref(window.location.search));
        return;
      }
      setNotice({
        kind: "error",
        text: authErrorMessage(result.data, "That code didn't work. Check it and try again."),
      });
    } catch {
      // coercion-ok: a network failure is reported to the student, not thrown.
      setNotice({
        kind: "error",
        text: "Can't reach the server. Check your connection and try again.",
      });
    } finally {
      if (!leavingPage) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-(--auth-gap)">
      <PanelHeading title="Enter your code">
        Open your authenticator app and type the code it shows.
      </PanelHeading>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-(--auth-gap)">
        <div className="flex flex-col gap-2">
          <Label htmlFor="two-factor-code">Authentication code</Label>
          <Input
            id="two-factor-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <NoticeText notice={notice} />
        <Button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? (
            <LoaderCircle className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          Verify and continue
        </Button>
      </form>
      <BackButton onClick={onBack} />
    </div>
  );
}
