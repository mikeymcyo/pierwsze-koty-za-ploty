"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MOBILE_NAV_ITEMS, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Primary navigation on phones: a floating bar with a raised centre action.
 *
 * It floats clear of the screen edge on glass, so the page reads through it
 * and it never looks bolted on. The centre Create button is the one sculpted
 * thing on the bar - gold, lifted, lit - because it is the one thing a site
 * manager opens the app to press. Every target is at least 56px tall so it
 * can be hit with gloves on.
 *
 * While somebody is typing - a caption, a note, a search - the bar steps
 * aside. A fixed bar and the iPhone keyboard between them left a strip of
 * screen for the box being typed into, and the bar sat over the field or
 * the controls under it. Nobody navigates mid-word; the bar is back the
 * moment the field is left. This is the whole of the keyboard handling.
 */
function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type;
    return !["button", "submit", "checkbox", "radio", "file", "range", "hidden", "reset"].includes(type);
  }
  return (element as HTMLElement).isContentEditable === true;
}

function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const update = () => setTyping(isTypingTarget(document.activeElement));
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return typing;
}

export function BottomNav() {
  const pathname = usePathname();
  const typing = useTyping();

  return (
    <nav
      aria-label="Primary"
      className={cn("fixed inset-x-0 bottom-0 z-40 px-3 pb-safe md:hidden", typing && "hidden")}
    >
      <ul className="mx-auto mb-2.5 flex max-w-lg items-stretch rounded-[26px] glass px-1 shadow-nav ring-1 ring-line/80">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;

          if (item.primary) {
            return (
              <li key={item.href} className="flex flex-1 justify-center">
                <Link
                  href={item.href}
                  className="-mt-6 flex flex-col items-center gap-1 px-2 pb-1.5"
                >
                  <span
                    className={cn(
                      "grid size-[58px] place-items-center rounded-full bg-primary text-ink-inverse shadow-glow ring-4 ring-surface-sunken transition-[transform,box-shadow] duration-200 ease-out active:scale-95",
                    )}
                  >
                    <Icon className="size-7" aria-hidden strokeWidth={2.75} />
                  </span>
                  <span className="text-[11px] font-semibold text-ink-muted">{item.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-200",
                  active ? "text-brand-ink" : "text-ink-subtle hover:text-ink-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-12 place-items-center rounded-full transition-colors duration-200",
                    active ? "bg-brand-soft" : "bg-transparent group-active:bg-surface-muted/70",
                  )}
                >
                  <Icon className="size-[22px]" aria-hidden strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className="text-[11px] font-semibold">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
