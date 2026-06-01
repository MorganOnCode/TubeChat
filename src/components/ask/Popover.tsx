"use client";

import { useEffect, useRef, useState } from "react";

interface TriggerArg {
  open: boolean;
  toggle: () => void;
}
interface PanelArg {
  close: () => void;
}

interface PopoverProps {
  trigger: (arg: TriggerArg) => React.ReactNode;
  children: (arg: PanelArg) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
}

/** Click-outside / Escape dismissable popover used by the scope filters. */
export function Popover({ trigger, children, align = "left", width }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="pop-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={"pop-panel" + (align === "right" ? " right" : "")}
          style={width ? { width } : undefined}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </span>
  );
}
