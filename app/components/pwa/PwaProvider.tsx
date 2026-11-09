import { appPath } from "@agent-native/core/client/api-path";
import { useT } from "@agent-native/core/client/i18n";
import { CommandMenu } from "@agent-native/toolkit/app/shared";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const PwaContext = createContext({
  installed: false,
  helpOpen: false,
  install: () => {},
});
export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const prompt = useRef<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const syncDisplay = () =>
      setInstalled(
        display.matches || Reflect.get(navigator, "standalone") === true,
      );
    const syncOnline = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      // The event is supplied by Chromium; never persist it across sessions.
      if ("prompt" in event && "userChoice" in event)
        prompt.current = event as InstallPrompt;
    };
    const didInstall = () => {
      prompt.current = null;
      setInstalled(true);
      setHelp(false);
    };
    syncDisplay();
    syncOnline();
    display.addEventListener("change", syncDisplay);
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let worker: ServiceWorker | null = null;
    const stateChanged = () => {
      if (
        !disposed &&
        worker?.state === "installed" &&
        navigator.serviceWorker.controller &&
        registration
      )
        setUpdate(registration);
    };
    const found = () => {
      worker?.removeEventListener("statechange", stateChanged);
      worker = registration?.installing ?? null;
      worker?.addEventListener("statechange", stateChanged);
    };
    // Dev/HMR must never be cached. HTTPS (or localhost) is required by browsers.
    if (
      import.meta.env.PROD &&
      window.isSecureContext &&
      "serviceWorker" in navigator
    ) {
      void navigator.serviceWorker
        .register(appPath("/sw.js"), {
          scope: appPath("/"),
          updateViaCache: "none",
        })
        .then((value) => {
          if (disposed) return;
          registration = value;
          if (value.waiting) setUpdate(value);
          value.addEventListener("updatefound", found);
          found();
        })
        .catch(() => {
          if (!disposed) setFailed(true);
        });
    }
    return () => {
      disposed = true;
      display.removeEventListener("change", syncDisplay);
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      registration?.removeEventListener("updatefound", found);
      worker?.removeEventListener("statechange", stateChanged);
    };
  }, []);
  const install = () => {
    const event = prompt.current;
    if (!event) {
      setHelp(true);
      return;
    }
    prompt.current = null;
    void event
      .prompt()
      .then(() => event.userChoice)
      .catch(() => setHelp(true));
  };
  const applyUpdate = () => {
    const waiting = update?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    const activated = () => {
      if (waiting.state === "activated") {
        waiting.removeEventListener("statechange", activated);
        window.location.reload();
      }
    };
    waiting.addEventListener("statechange", activated);
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  };
  return (
    <PwaContext.Provider value={{ installed, helpOpen: help, install }}>
      {children}
      {(offline || update || failed) && (
        <aside className="pwa-status" aria-label={t("pwa.status")}>
          <span role="status">
            {offline
              ? t("pwa.offline")
              : update
                ? t("pwa.update")
                : t("pwa.unavailable")}
          </span>
          {update && !offline && (
            <Button onClick={applyUpdate}>{t("pwa.reload")}</Button>
          )}
        </aside>
      )}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="pwa-install-dialog">
          <DialogHeader>
            <DialogTitle>{t("pwa.install")}</DialogTitle>
            <DialogDescription>{t("pwa.instructions")}</DialogDescription>
          </DialogHeader>
          <img
            src={appPath("/pwa/icon-192.png")}
            width="80"
            height="80"
            alt="Acharya"
          />
          <p>{t("pwa.requirements")}</p>
        </DialogContent>
      </Dialog>
    </PwaContext.Provider>
  );
}
export function PwaCommandItem() {
  const { installed, install } = usePwa();
  const t = useT();
  return installed ? null : (
    <CommandMenu.Item onSelect={install}>{t("pwa.install")}</CommandMenu.Item>
  );
}
