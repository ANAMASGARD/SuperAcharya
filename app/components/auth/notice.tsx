import { CircleAlert, CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Notice {
  kind: "error" | "success";
  text: string;
}

/**
 * Inline status for an auth step. Carries an icon and a role, so meaning never
 * depends on colour alone, and errors are announced as alerts.
 */
export function NoticeText({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  const isError = notice.kind === "error";
  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl border-2 border-black px-3 py-1.5 text-sm font-medium text-black shadow-sm",
        isError ? "bg-[#FFB5A7]" : "bg-[#B8E5E1]",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{notice.text}</span>
    </p>
  );
}
