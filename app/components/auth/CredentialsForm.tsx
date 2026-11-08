import { Eye, EyeOff, LoaderCircle, Mail } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import {
  FIELD_CLASS,
  PRIMARY_BUTTON_CLASS,
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
import { cn } from "@/lib/utils";

export type AuthMode = "sign-in" | "sign-up";

interface CredentialsFormProps {
  mode: AuthMode;
  initialNotice: Notice | null;
  onForgot: (email: string) => void;
  onVerifyEmail: (email: string, password: string) => void;
  onTwoFactor: () => void;
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  visible: boolean;
  /** Renders the show/hide button when given. */
  onToggleVisible?: (() => void) | undefined;
  /** Sits on the label row, to the right of the label. */
  labelAction?: ReactNode;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  visible,
  onToggleVisible,
  labelAction,
}: PasswordFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(FIELD_CLASS, onToggleVisible && "pr-10")}
        />
        {onToggleVisible ? (
          <button
            type="button"
            onClick={onToggleVisible}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-black/70 hover:text-black"
          >
            {visible ? (
              <EyeOff className="size-4.5" aria-hidden="true" />
            ) : (
              <Eye className="size-4.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CredentialsForm({
  mode,
  initialNotice,
  onForgot,
  onVerifyEmail,
  onTwoFactor,
}: CredentialsFormProps) {
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(initialNotice);

  function fail(text: string) {
    setNotice({ kind: "error", text });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const address = normalizeEmail(email);
    if (!isValidEmail(address)) return fail("Enter a valid email address.");
    if (!password) return fail("Enter your password.");
    if (isSignUp && password !== confirmation) {
      return fail("The two passwords don't match.");
    }

    setBusy(true);
    setNotice(null);
    let leavingPage = false;
    try {
      const resume = resolveResumeHref(window.location.search);

      if (isSignUp) {
        const created = await requestAuth("/_agent-native/auth/register", {
          email: address,
          password,
          callbackURL: resume,
        });
        if (!created.ok) {
          return fail(
            authErrorMessage(
              created.data,
              "We couldn't create that account. Check the details and try again.",
            ),
          );
        }
      }

      const login = await requestAuth("/_agent-native/auth/login", {
        email: address,
        password,
      });
      if (login.ok) {
        if (login.data.twoFactorRedirect === true) return onTwoFactor();
        leavingPage = true;
        return enterApp(resume);
      }
      if (isEmailNotVerified(login)) return onVerifyEmail(address, password);
      return fail(
        authErrorMessage(
          login.data,
          isSignUp
            ? "Your account was created, but signing in failed. Try signing in."
            : "That email and password don't match.",
        ),
      );
    } catch {
      // coercion-ok: a network failure is reported to the student, not thrown.
      return fail("Can't reach the server. Check your connection and try again.");
    } finally {
      // After a successful sign-in the page navigates away; keep the button busy
      // so a second click can't submit again.
      if (!leavingPage) setBusy(false);
    }
  }

  const toggleVisible = () => setShowPassword((visible) => !visible);

  // The inputs have no `name`, so a native submit before hydration sends no
  // fields. Otherwise the password would land in the URL as a GET query.
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-(--auth-gap)"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth-email">Email</Label>
        <div className="relative">
          <Input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@school.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={cn(FIELD_CLASS, "pr-10")}
          />
          <Mail
            className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-black/60"
            aria-hidden="true"
          />
        </div>
      </div>

      {isSignUp ? (
        <div className="grid gap-(--auth-gap) sm:grid-cols-2">
          <PasswordField
            id="auth-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Create one"
            visible={showPassword}
            onToggleVisible={toggleVisible}
          />
          <PasswordField
            id="auth-confirm"
            label="Confirm"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            placeholder="Repeat it"
            visible={showPassword}
          />
        </div>
      ) : (
        <PasswordField
          id="auth-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Your password"
          visible={showPassword}
          onToggleVisible={toggleVisible}
          labelAction={
            <button
              type="button"
              onClick={() => onForgot(email)}
              className="rounded text-xs font-semibold text-[#C2410C] underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          }
        />
      )}

      <NoticeText notice={notice} />

      <Button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className={PRIMARY_BUTTON_CLASS}
      >
        {busy ? (
          <LoaderCircle
            className="size-4.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
        {isSignUp
          ? busy
            ? "Creating account"
            : "Create account"
          : busy
            ? "Signing in"
            : "Sign in"}
      </Button>
    </form>
  );
}
