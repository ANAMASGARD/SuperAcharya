import { useSession } from "@agent-native/core/client/use-session";
import { isVerificationLinkInvalid } from "@agent-native/core/shared/sign-in-journey";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { TITLE_CLASS } from "@/components/auth/auth-styles";
import { AuthStage } from "@/components/auth/AuthStage";
import {
  CredentialsForm,
  type AuthMode,
} from "@/components/auth/CredentialsForm";
import type { Notice } from "@/components/auth/notice";
import {
  ForgotPanel,
  TwoFactorPanel,
  VerifyEmailPanel,
} from "@/components/auth/SecondaryPanels";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { resolveResumeHref } from "@/lib/auth-client";
import { APP_TITLE } from "@/lib/app-config";
import { LANDING_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/public-routes";

export type { AuthMode };

type AuthView =
  | { kind: "credentials" }
  | { kind: "forgot"; email: string }
  | { kind: "verify-email"; email: string }
  | { kind: "two-factor" };

const COPY: Record<
  AuthMode,
  {
    title: string;
    subtitle: string;
    switchPrompt: string;
    switchLabel: string;
    switchPath: string;
  }
> = {
  "sign-in": {
    title: "Sign in",
    subtitle: "Pick up where the board left off.",
    switchPrompt: "New to Super Acharya?",
    switchLabel: "Create an account",
    switchPath: SIGN_UP_PATH,
  },
  "sign-up": {
    title: "Create account",
    subtitle: "Your first lesson is one question away.",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchPath: SIGN_IN_PATH,
  },
};

/** Notice carried in by an email link: verified, or a link that no longer works. */
function noticeFromSearch(search: string): Notice | null {
  const params = new URLSearchParams(search);
  if (isVerificationLinkInvalid(params.get("error"))) {
    return { kind: "error", text: "That verification link is invalid or has expired." };
  }
  if (params.get("verified")) {
    return { kind: "success", text: "Email verified. Sign in to continue." };
  }
  return null;
}

/**
 * Full-screen sign-in / sign-up. The left half is the product stage; the right
 * half is the form. Authentication itself is the framework's Better Auth session
 * (email and password plus social providers), so a signed-in student who visits
 * this screen is sent straight on to the whiteboard.
 */
export function AuthScreen({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, session } = useSession();
  const [view, setView] = useState<AuthView>({ kind: "credentials" });
  const pendingPassword = useRef("");
  const copy = COPY[mode];
  const initialNotice = useMemo(
    () => noticeFromSearch(location.search),
    [location.search],
  );

  useEffect(() => {
    if (status === "authenticated" && session) {
      navigate(resolveResumeHref(window.location.search), { replace: true });
    }
  }, [status, session, navigate]);

  function backToCredentials() {
    pendingPassword.current = "";
    setView({ kind: "credentials" });
  }

  function renderView() {
    switch (view.kind) {
      case "credentials":
        return (
          <div className="flex flex-col gap-(--auth-gap)">
            <div className="flex flex-col gap-1.5 text-center">
              <h1 className={TITLE_CLASS}>{copy.title}</h1>
              <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>
            <CredentialsForm
              key={mode}
              mode={mode}
              initialNotice={initialNotice}
              onForgot={(email) => setView({ kind: "forgot", email })}
              onVerifyEmail={(email, password) => {
                pendingPassword.current = password;
                setView({ kind: "verify-email", email });
              }}
              onTwoFactor={() => setView({ kind: "two-factor" })}
            />
            <div className="flex items-center gap-3" role="separator" aria-label="or">
              <span className="h-0.5 flex-1 rounded-full bg-black" />
              <span className="font-head text-xs">or</span>
              <span className="h-0.5 flex-1 rounded-full bg-black" />
            </div>
            <SocialButtons />
            <p className="text-center text-sm">
              {copy.switchPrompt}{" "}
              <Link
                to={`${copy.switchPath}${location.search}`}
                className="font-bold underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                {copy.switchLabel}
              </Link>
            </p>
          </div>
        );
      case "forgot":
        return <ForgotPanel initialEmail={view.email} onBack={backToCredentials} />;
      case "verify-email":
        return (
          <VerifyEmailPanel
            email={view.email}
            password={pendingPassword.current}
            onBack={backToCredentials}
          />
        );
      case "two-factor":
        return <TwoFactorPanel onBack={backToCredentials} />;
      default: {
        const unhandled: never = view;
        return unhandled;
      }
    }
  }

  return (
    // On desktop the layout is exactly one window tall: the stage scales to fit
    // it instead of stretching the page, and only the form column could scroll
    // (in a window too short for the form), never the page.
    <div className="auth-screen min-h-dvh bg-background text-foreground lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden lg:p-3">
      <AuthStage />

      <header className="flex h-14 items-center rounded-b-2xl border-b-2 border-black bg-primary px-6 lg:hidden">
        <Link to={LANDING_PATH} className="font-head text-xl leading-none">
          {APP_TITLE}
        </Link>
      </header>

      <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col px-6 py-3 sm:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-12 lg:py-2">
        <Link
          to={LANDING_PATH}
          className="inline-flex items-center gap-2 self-start rounded text-sm font-semibold underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
        </Link>
        <div className="m-auto w-full max-w-sm py-3">{renderView()}</div>
      </main>
    </div>
  );
}
