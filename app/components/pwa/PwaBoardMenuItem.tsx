import { useT } from "@agent-native/core/client/i18n";
import { MainMenu } from "@excalidraw/excalidraw";
import { Download } from "lucide-react";

import { usePwa } from "./PwaProvider";
export function PwaBoardMenuItem() {
  const { installed, install } = usePwa();
  const t = useT();
  return installed ? null : (
    <MainMenu.Item
      className="board-menu-action"
      icon={<Download aria-hidden="true" />}
      onSelect={install}
    >
      {t("pwa.install")}
    </MainMenu.Item>
  );
}
