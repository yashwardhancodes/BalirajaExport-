// Shared building blocks so every page has the same header, sections, badges and fields.

import type { ReactNode } from "react";
import type { ShipmentStatus } from "@/lib/types";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1 min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-slate-500 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A card with a titled header row. */
export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card space-y-4 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            {title && <h2 className="text-base font-semibold text-ink flex flex-wrap items-center gap-2">{title}</h2>}
            {description && <p className="text-xs text-slate-500 max-w-2xl">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A small labelled block inside a card (e.g. "Bulk stage", "Cost to us"). */
export function SubSection({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="eyebrow">{title}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

export const STATUS_STYLE: Record<ShipmentStatus, string> = {
  quoted: "bg-slate-100 text-slate-700 ring-slate-200",
  confirmed: "bg-sky-50 text-sky-700 ring-sky-200",
  produced: "bg-amber-50 text-amber-800 ring-amber-200",
  shipped: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-brand-soft text-brand-dark ring-emerald-200",
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "good" | "bad"; children: ReactNode }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    warn: "bg-amber-100 text-amber-800",
    good: "bg-brand-soft text-brand-dark",
    bad: "bg-red-50 text-red-700",
  };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function UnsavedBadge() {
  return <Pill tone="warn">Unsaved changes</Pill>;
}

/** Two-or-more option toggle, e.g. Quoted / Actual. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-canvas p-0.5 ring-1 ring-inset ring-line text-xs">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              active ? "bg-white text-ink shadow-card" : "text-slate-500 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({
  label,
  value,
  accent,
  sub,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
  sub?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`figure font-semibold ${size === "lg" ? "text-xl" : "text-base"} ${accent ?? "text-ink"} break-words`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas/50 px-4 py-8 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="text-sm text-slate-500 mt-1">{children}</div>}
    </div>
  );
}

export function LoadingState() {
  return <p className="text-sm text-slate-500 py-6">Loading…</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-xs text-red-600">{children}</p>;
}

export function marginClass(value: number | null | undefined) {
  if (value === null || value === undefined) return "text-slate-400";
  return value >= 0 ? "text-emerald-700" : "text-red-600";
}
