import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  rule?: boolean;
};

/** Magazine-style micro section header. Mono small caps, optional hairline rule. */
export function SectionLabel({ children, className, rule = false }: Props) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="eyebrow shrink-0">{children}</span>
      {rule && <span className="h-px flex-1 bg-[var(--color-border)]" />}
    </div>
  );
}
