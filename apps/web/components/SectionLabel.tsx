import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  rule?: boolean;
};

/* Magazine-style micro section header. Mono small caps with an optional
 * hairline rule whose left edge picks up a phosphor accent — a tiny
 * editorial gesture that visually anchors each section. */
export function SectionLabel({ children, className, rule = false }: Props) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="eyebrow shrink-0">{children}</span>
      {rule && (
        <span className="relative h-px flex-1 bg-[var(--color-border)]">
          <span className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--color-accent)] to-transparent" />
        </span>
      )}
    </div>
  );
}
