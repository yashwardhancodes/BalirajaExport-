"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Simple 24px line icons, drawn with currentColor so they follow the text colour.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const ICONS = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  ),
  shipments: (
    <Icon>
      <path d="M3 17h13l3-5H6z" />
      <path d="M8 12V7h5l2 5" />
      <path d="M2 20c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    </Icon>
  ),
  products: (
    <Icon>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </Icon>
  ),
  suppliers: (
    <Icon>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </Icon>
  ),
  clients: (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </Icon>
  ),
};

const GROUPS = [
  {
    title: "Operations",
    items: [
      { href: "/", label: "Dashboard", short: "Home", icon: ICONS.dashboard },
      { href: "/shipments", label: "Shipments", short: "Shipments", icon: ICONS.shipments },
    ],
  },
  {
    title: "Rate book",
    items: [
      { href: "/products", label: "Products", short: "Products", icon: ICONS.products },
      { href: "/suppliers", label: "Suppliers & rates", short: "Rates", icon: ICONS.suppliers },
      { href: "/clients", label: "Clients", short: "Clients", icon: ICONS.clients },
    ],
  },
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ size }: { size: number }) {
  return (
    // The medal fills ~75% of the square image; zoom so the circle crop hides the black corners.
    <span
      className="relative shrink-0 overflow-hidden rounded-full ring-2 ring-bronze-light/30 shadow-lg shadow-black/30"
      style={{ width: size, height: size }}
    >
      <Image src="/brand/baliraja-logo-dark.jpg" alt="" fill sizes={`${size}px`} priority className="object-cover scale-[1.32]" />
    </span>
  );
}

/** Desktop: left sidebar. Phone: slim top bar with the brand + bottom tab bar, like a phone app. */
export default function Navigation() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col bg-brand-deep text-emerald-50 w-60 shrink-0 sticky top-0 h-screen" aria-label="Main">
        <Link href="/" className="flex items-center gap-3 px-4 pt-5 pb-6" aria-label="Baliraja Farm Fresh, go to dashboard">
          <Logo size={48} />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight tracking-tight">Baliraja Farm Fresh</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-bronze-light">Cost &amp; Margin</span>
          </span>
        </Link>
        <div className="flex flex-col gap-6 px-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300/60">{group.title}</div>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? "bg-white/10 text-white font-medium" : "text-emerald-100/80 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className={active ? "text-bronze-light" : "text-emerald-300/70"}>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* Phone top bar */}
      <header
        className="md:hidden sticky z-30 flex items-center gap-2.5 bg-brand-deep text-emerald-50 px-4 py-2.5 shadow-md"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <Link href="/" className="flex items-center gap-2.5 min-w-0" aria-label="Baliraja Farm Fresh, go to dashboard">
          <Logo size={36} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight truncate">Baliraja Farm Fresh</span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-bronze-light">Cost &amp; Margin</span>
          </span>
        </Link>
      </header>

      {/* Phone bottom tab bar */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Main"
      >
        <ul className="grid grid-cols-5">
          {ALL_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors ${
                    active ? "text-brand" : "text-slate-500"
                  }`}
                >
                  <span className={`grid place-items-center rounded-full px-4 py-0.5 ${active ? "bg-brand-soft" : ""}`}>{item.icon}</span>
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
