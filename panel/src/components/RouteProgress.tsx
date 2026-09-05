"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);
  const key = `${pathname}?${searchParams.toString()}`;
  const lastKey = useRef(key);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
      if (href === `${pathname}${searchParams.size > 0 ? `?${searchParams}` : ""}`) return;

      timers.current.forEach(clearTimeout);
      timers.current = [];
      setVisible(true);
      setPct(20);
      timers.current.push(setTimeout(() => setPct(55), 100));
      timers.current.push(setTimeout(() => setPct(75), 400));
      timers.current.push(setTimeout(() => setPct(88), 1200));
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (!visible) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPct(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 200);
    return () => clearTimeout(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-transparent">
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%`, opacity: pct === 100 ? 0 : 1, transition: "width 300ms ease-out, opacity 200ms ease-out 100ms" }}
      />
    </div>
  );
}
