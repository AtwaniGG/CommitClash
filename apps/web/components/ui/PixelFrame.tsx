import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "magenta" | "cyan" | "acid" | "burn" | "ok";

const titlebarTone: Record<Tone, string> = {
  default: "bg-gradient-to-r from-magenta to-cyan text-bg-base",
  magenta: "bg-magenta text-bg-base",
  cyan: "bg-cyan text-bg-base",
  acid: "bg-acid text-bg-base",
  burn: "bg-burn text-ink",
  ok: "bg-ok text-bg-base",
};

export function PixelFrame({
  title,
  status,
  tone = "default",
  className,
  children,
}: {
  title?: string;
  status?: ReactNode;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("pixel-frame", className)}>
      {title !== undefined && (
        <div className={cn("pixel-titlebar", titlebarTone[tone])}>
          <span className="flex items-center gap-2">
            <span aria-hidden>{"▶"}</span>
            <span>{title}</span>
          </span>
          {status && <span>{status}</span>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
