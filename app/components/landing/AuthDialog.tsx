import { buildSignInReturnHref } from "@agent-native/core/client/sign-in-return";
import { useSession } from "@agent-native/core/client/use-session";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HOME_PATH } from "@/lib/chat-paths";

export type AuthDialogMode = "sign-in" | "sign-up";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AuthDialogMode;
}

export function AuthDialog({ open, onOpenChange, mode }: AuthDialogProps) {
  const navigate = useNavigate();
  const { status } = useSession();
  const [useIframe, setUseIframe] = useState(true);

  const signInHref = useMemo(
    () => buildSignInReturnHref({ returnTo: HOME_PATH }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (status === "authenticated") {
      onOpenChange(false);
      navigate(HOME_PATH, { replace: true });
    }
  }, [open, status, navigate, onOpenChange]);

  const title = mode === "sign-up" ? "Create your account" : "Sign in";
  const description =
    mode === "sign-up"
      ? "Use email, magic link, or social sign-up. After verification you’ll continue to the app."
      : "Use email, magic link, or social sign-in. You’ll return to the app when finished.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-2 border-border p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border px-4 py-4 text-left">
          <SheetTitle className="font-black">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          {useIframe ? (
            <iframe
              title={title}
              src={signInHref}
              className="min-h-[70vh] w-full flex-1 border-0 bg-background"
              onError={() => setUseIframe(false)}
            />
          ) : null}
          <div className="flex flex-col gap-2 border-t border-border p-4">
            {!useIframe ? (
              <p className="text-sm text-muted-foreground">
                Open the secure sign-in page to continue.
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                window.location.assign(signInHref);
              }}
            >
              {mode === "sign-up" ? "Continue to sign up" : "Continue to sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
