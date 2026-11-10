import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import enUS from "@/i18n/en-US";
import {
  authErrorMessage,
  enterApp,
  requestAuth,
  resolveResumeHref,
} from "@/lib/auth-client";

import {
  FIELD_CLASS,
  OUTLINE_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  TITLE_CLASS,
} from "./auth-styles";
import { NoticeText, type Notice } from "./notice";

type Props = { onBack: () => void } & (
  | {
      purpose: "verification";
      email: string;
      password: string;
      onTwoFactor: () => void;
    }
  | { purpose: "sign-in" }
);

export function EmailCodePanel(props: Props) {
  const t = useT();
  const copy = (key: keyof typeof enUS.emailAuth) =>
    t(`emailAuth.${key}`, { defaultValue: enUS.emailAuth[key] });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(
    props.purpose === "verification" ? 60 : 0,
  );
  const [notice, setNotice] = useState<Notice | null>(
    props.purpose === "verification"
      ? {
          kind: "success",
          text: t("emailAuth.sentTo", {
            defaultValue: enUS.emailAuth.sentTo,
            email: props.email,
          }),
        }
      : null,
  );
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (props.purpose === "sign-in" && !started.current) {
      started.current = true;
      void send();
    }
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const sent =
        props.purpose === "verification"
          ? await requestAuth(
              "/_agent-native/auth/ba/email-otp/send-verification-otp",
              { email: props.email, type: "email-verification" },
            )
          : await requestAuth("/_agent-native/auth/ba/two-factor/send-otp", {});
      if (!alive.current) return;
      if (sent.ok) {
        setCooldown(60);
        setNotice({ kind: "success", text: copy("sent") });
      } else
        setNotice({
          kind: "error",
          text: authErrorMessage(sent.data, copy("sendFailed")),
        });
    } catch {
      if (alive.current) setNotice({ kind: "error", text: copy("network") });
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setNotice({ kind: "error", text: copy("invalidFormat") });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result =
        props.purpose === "verification"
          ? await requestAuth("/_agent-native/auth/ba/email-otp/verify-email", {
              email: props.email,
              otp: code.trim(),
            })
          : await requestAuth("/_agent-native/auth/ba/two-factor/verify-otp", {
              code: code.trim(),
              trustDevice: false,
            });
      if (!alive.current) return;
      if (!result.ok) {
        setNotice({
          kind: "error",
          text: authErrorMessage(result.data, copy("invalidCode")),
        });
        return;
      }
      if (props.purpose === "verification") {
        const login = await requestAuth(
          "/_agent-native/auth/ba/sign-in/email",
          { email: props.email, password: props.password },
        );
        if (!alive.current) return;
        if (login.ok && login.data.twoFactorRedirect) {
          props.onTwoFactor();
          return;
        }
        // Verification alone never grants access; server must complete sign-in.
        if (!login.ok) {
          setNotice({ kind: "error", text: copy("verified") });
          return;
        }
      }
      enterApp(resolveResumeHref(window.location.search));
    } catch {
      if (alive.current) setNotice({ kind: "error", text: copy("network") });
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-(--auth-gap)">
      <h1 className={`${TITLE_CLASS} text-center`}>
        {props.purpose === "verification"
          ? copy("verifyTitle")
          : copy("signinTitle")}
      </h1>
      <p className="text-center text-sm text-muted-foreground">
        {copy("instructions")}
      </p>
      <form onSubmit={verify} className="flex flex-col gap-(--auth-gap)">
        <Label htmlFor="email-code">{copy("label")}</Label>
        <Input
          id="email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={FIELD_CLASS}
        />
        <NoticeText notice={notice} />
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? copy("busy") : copy("verify")}
        </Button>
      </form>
      <Button
        type="button"
        disabled={busy || cooldown > 0}
        onClick={() => void send()}
        className={OUTLINE_BUTTON_CLASS}
      >
        {cooldown > 0
          ? t("emailAuth.cooldown", {
              defaultValue: enUS.emailAuth.cooldown,
              seconds: cooldown,
            })
          : copy("resend")}
      </Button>
      <Button
        type="button"
        onClick={props.onBack}
        className={OUTLINE_BUTTON_CLASS}
      >
        {copy("back")}
      </Button>
    </div>
  );
}
