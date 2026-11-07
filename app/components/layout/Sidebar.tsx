import { useT } from "@agent-native/core/client/i18n";
import { OrgSwitcher } from "@agent-native/toolkit/app/org";
import { openCommandMenu } from "@agent-native/toolkit/app/shared";
import {
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMessageCircle,
  IconSearch,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_TITLE } from "@/lib/app-config";
import { HOME_PATH, NEW_CHAT_PATH } from "@/lib/chat-paths";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  collapsible?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function NavLink({
  to,
  collapsed,
  active,
  label,
  icon: Icon,
}: {
  to: string;
  collapsed: boolean;
  active: boolean;
  label: string;
  icon: typeof IconHome;
}) {
  const link = (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "flex items-center text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active && "bg-sidebar-accent",
        collapsed
          ? "size-8 justify-center rounded-md"
          : "h-8 w-full gap-3 rounded-lg px-3 text-sm font-medium",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} />
      <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return <div className="px-2">{link}</div>;
}

export function Sidebar({
  collapsed = false,
  collapsible = true,
  onCollapsedChange,
}: SidebarProps) {
  const t = useT();
  const location = useLocation();
  const ToggleIcon = collapsed
    ? IconLayoutSidebarLeftExpand
    : IconLayoutSidebarLeftCollapse;
  const collapseButton = collapsible ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label={
            collapsed
              ? t("navigation.expandSidebar")
              : t("navigation.collapseSidebar")
          }
        >
          <ToggleIcon className="size-4" strokeWidth={1.8} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed
          ? t("navigation.expandSidebar")
          : t("navigation.collapseSidebar")}
      </TooltipContent>
    </Tooltip>
  ) : null;
  const searchButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={openCommandMenu}
          aria-label={t("root.commandSearch")}
          className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <IconSearch className="size-4" strokeWidth={1.8} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t("root.commandSearch")}</TooltipContent>
    </Tooltip>
  );

  const chatActive =
    location.pathname === NEW_CHAT_PATH ||
    location.pathname.startsWith(`${NEW_CHAT_PATH}/`);

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-12" : "w-full",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-1" : "px-3",
        )}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={HOME_PATH}
                aria-label={APP_TITLE}
                className="flex size-8 items-center justify-center rounded border-2 border-sidebar-border bg-main font-black text-xs shadow-shadow"
              >
                SA
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{APP_TITLE}</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            to={HOME_PATH}
            className="truncate text-sm font-black uppercase tracking-wide text-sidebar-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {APP_TITLE}
          </Link>
        )}
      </div>

      <nav
        aria-label={t("navigation.navigation")}
        className={cn(
          "flex flex-col gap-1 py-2",
          collapsed ? "items-center px-1" : "",
        )}
      >
        <NavLink
          to={HOME_PATH}
          collapsed={collapsed}
          active={location.pathname === HOME_PATH}
          label={t("navigation.home")}
          icon={IconHome}
        />
        <NavLink
          to={NEW_CHAT_PATH}
          collapsed={collapsed}
          active={chatActive}
          label={t("navigation.chat")}
          icon={IconMessageCircle}
        />
      </nav>

      <div className="mt-auto shrink-0 border-t border-sidebar-border p-2">
        <div
          className={cn(
            collapsed
              ? "flex flex-col items-center gap-1"
              : "flex items-center gap-0.5",
          )}
        >
          <OrgSwitcher
            reserveSpace
            compact={collapsed}
            currentAppId="chat"
            className={
              collapsed
                ? "size-8 bg-transparent p-0 hover:bg-sidebar-accent"
                : "min-w-0 flex-1 h-11 rounded-lg bg-transparent px-3 py-2 text-sm text-sidebar-accent-foreground hover:bg-sidebar-accent"
            }
          />
          {searchButton}
          {collapseButton}
        </div>
      </div>
    </aside>
  );
}
