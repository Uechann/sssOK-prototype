interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Svg({
  size = 24,
  strokeWidth = 1.9,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.1}>
    <path d="M9.5 14.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14.5 9.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </Svg>
);

export const IconMore = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <circle cx="5" cy="12" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <circle cx="19" cy="12" r="0.6" fill="currentColor" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.1}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
    <path d="M5 12.5 10 17.5 19 7.5" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 4h4M6 7l1 12.5h10L18 7" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);

export const IconMoveFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
    <path d="M10 13h6M14 10.5 16.5 13 14 15.5" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.1}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M5 19h14" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.3}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M14.5 5 8 12l6.5 7" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M9.5 5 16 12l-6.5 7" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M5 9.5 12 16l7-6.5" />
  </Svg>
);

export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h5M12 8h9M3 16h9M16 16h5" />
    <circle cx="10" cy="8" r="2.1" />
    <circle cx="14" cy="16" r="2.1" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
  </Svg>
);

export const IconFolderPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
    <path d="M11 10v6M8 13h6" />
  </Svg>
);

export const IconFolderEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
    <path d="m9 15.5 5.5-5.5 2 2-5.5 5.5H9z" />
  </Svg>
);

export const IconFolderX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
    <path d="m9 11.5 4 4M13 11.5l-4 4" />
  </Svg>
);

export const IconQr = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2}>
    <rect x="4" y="4" width="6" height="6" rx="1.4" />
    <rect x="14" y="4" width="6" height="6" rx="1.4" />
    <rect x="4" y="14" width="6" height="6" rx="1.4" />
    <path d="M14 14h2.5v2.5H14zM19.5 14H20v.5M14 19.5v.5h.5M19 18.5h1M17.5 20h2.5" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.4" />
    <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
  </Svg>
);

export const IconWifiOff = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.1}>
    <path d="M3 4l18 18" />
    <path d="M8.5 13.5a5 5 0 0 1 6-.8M5 10a10 10 0 0 1 4-2.4M19 10a10 10 0 0 0-8.5-2.9" />
    <circle cx="12" cy="18" r="1" fill="currentColor" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.1}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" />
  </Svg>
);

export const IconPlay = ({ size = 24, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M8.5 6.2 18 12l-9.5 5.8z" fill="currentColor" />
  </svg>
);

export const IconRetry = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5 17 4.5-4.5 3 3L16 12l3.5 3.5" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5h7L18.5 9v11.5h-12z" />
    <path d="M13 3.5V9h5.5" />
  </Svg>
);

export const IconBrokenLink = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M10 7 8 5a3.5 3.5 0 0 0-5 5l2 2" />
    <path d="M14 17l2 2a3.5 3.5 0 0 0 5-5l-2-2" />
    <path d="M15 5.5 16.5 4M19 9l1.8-.6M9 18.5 7.5 20M5 15l-1.8.6" />
  </Svg>
);
