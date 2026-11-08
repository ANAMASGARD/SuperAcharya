import { LoaderCircle } from "lucide-react";
import { useState, type ComponentType } from "react";

import { OUTLINE_BUTTON_CLASS } from "@/components/auth/auth-styles";
import { NoticeText, type Notice } from "@/components/auth/notice";
import {
  FacebookIcon,
  GoogleIcon,
  MicrosoftIcon,
} from "@/components/auth/social-icons";
import { Button } from "@/components/ui/button";
import {
  resolveResumeHref,
  startSocialSignIn,
  type SocialProviderId,
} from "@/lib/auth-client";

interface SocialProvider {
  id: SocialProviderId;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}

const PROVIDERS: readonly SocialProvider[] = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
];

function labelFor(id: SocialProviderId): string {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  return provider ? provider.label : id;
}

/**
 * One button per social provider. A provider without credentials is reported
 * inline ("not set up yet") instead of sending the student to an error page,
 * and starts working as soon as its credentials are added on the server.
 */
export function SocialButtons({ disabled = false }: { disabled?: boolean }) {
  const [pending, setPending] = useState<SocialProviderId | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function start(id: SocialProviderId) {
    if (pending) return;
    setPending(id);
    setNotice(null);
    const result = await startSocialSignIn(
      id,
      resolveResumeHref(window.location.search),
    );
    switch (result.status) {
      case "redirecting":
        // Leaving the page: keep the button busy until the browser navigates.
        return;
      case "not-configured":
        setNotice({
          kind: "error",
          text: `${labelFor(id)} sign-in isn't set up for this app yet. Use your email for now.`,
        });
        break;
      case "failed":
        setNotice({
          kind: "error",
          text: `We couldn't start ${labelFor(id)} sign-in. Try again in a moment.`,
        });
        break;
      default: {
        const unhandled: never = result;
        return unhandled;
      }
    }
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2">
      {PROVIDERS.map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          disabled={disabled || pending !== null}
          aria-busy={pending === id}
          onClick={() => void start(id)}
          className={OUTLINE_BUTTON_CLASS}
        >
          {pending === id ? (
            <LoaderCircle
              className="size-4.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Icon className="size-4.5" />
          )}
          Continue with {label}
        </Button>
      ))}
      <NoticeText notice={notice} />
    </div>
  );
}
