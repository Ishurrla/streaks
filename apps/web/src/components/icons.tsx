// SVG icons from design/streaks-prototype.html.

type IconProps = { className?: string };

export function Flame({ live = false, className = "" }: { live?: boolean; className?: string }) {
  return (
    <svg className={`flame ${live ? "flame-live" : ""} ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.5c.9 3.6 5.2 5.9 5.2 11a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.6 2.1-4.7.3 1.4 1 2.2 1.8 2.5C10.2 7.5 10.6 4.2 12 1.5z"
        fill="var(--flame)"
      />
      <path
        d="M12 22a3 3 0 0 1-3-3c0-1.7 1.4-2.5 2-4 .4.8 1 1.2 1.6 1.2C12.2 14.6 13.6 13.6 13.8 12.8 14.7 14 15 15.2 15 19a3 3 0 0 1-3 3z"
        fill="#FFD27A"
      />
    </svg>
  );
}

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="3">
      <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function TodayIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}

export function ListIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="2">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="2">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="2">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg className={className} {...stroke} strokeWidth="2">
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  );
}

export function ChevronLeft({ className }: IconProps) {
  return (
    <svg className={className} width="18" height="18" {...stroke} strokeWidth="2.5">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight({ className }: IconProps) {
  return (
    <svg className={className} width="18" height="18" {...stroke} strokeWidth="2.5">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
