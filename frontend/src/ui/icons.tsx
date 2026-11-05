/**
 * render the upload icon
 */
export function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M12 16V4M12 4L8 8M12 4L16 8" />
      <path d="M4 14V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V14" />
    </svg>
  );
}
/**
 * render the check icon
 */
export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M5 13L10 18L19 7" />
    </svg>
  );
}
/**
 * render the alert icon
 */
export function AlertIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M12 4L3 20H21L12 4Z" />
      <path d="M12 10V13M12 16H12.01" />
    </svg>
  );
}
/**
 * render the close icon
 */
export function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18" />
    </svg>
  );
}
/**
 * render the lock icon
 */
export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" />
    </svg>
  );
}
/**
 * render the cube icon
 */
export function CubeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M12 3L3 8V16L12 21L21 16V8L12 3Z" />
      <path d="M3 8L12 13L21 8" />
      <path d="M12 13V21" />
    </svg>
  );
}
/**
 * render the grid icon
 */
export function GridIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
/**
 * render the refresh icon
 */
export function RefreshIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M20 12C20 16.4 16.4 20 12 20C7.6 20 4 16.4 4 12C4 7.6 7.6 4 12 4C14.3 4 16.4 5 17.9 6.6" />
      <path d="M17.9 4V6.6H15.7" />
    </svg>
  );
}
/**
 * render the pointer icon
 */
export function PointerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M5 4L18 12L12 13.5L9 20L5 4Z" />
    </svg>
  );
}
/**
 * render the pencil icon
 */
export function PencilIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M14 3L21 10L10 21H3V14L14 3Z" />
      <path d="M14 3L18 7" />
    </svg>
  );
}
/**
 * render the panel icon
 */
export function PanelLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M8 3V21" />
    </svg>
  );
}
/**
 * render the left chevron icon
 */
export function ChevronLeftIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M15 18L9 12L15 6" />
    </svg>
  );
}
/**
 * render the right chevron icon
 */
export function ChevronRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M9 18L15 12L9 6" />
    </svg>
  );
}
/**
 * render the fit-to-view icon
 */
export function FitIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M3 8V3H8" /><path d="M16 3H21V8" /><path d="M21 16V21H16" /><path d="M8 21H3V16" />
    </svg>
  );
}
/**
 * render the triangle-view icon
 */
export function TriangleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M12 4L20 20H4L12 4Z" />
      <path d="M12 4V20M4 20L20 20" />
    </svg>
  );
}
/**
 * render the layers icon
 */
export function LayersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M12 3L3 9L12 15L21 9L12 3Z" /><path d="M3 15L12 21L21 15" />
    </svg>
  );
}

/**
 * render the info icon
 */
export function InfoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={1.5} />
      <path d="M8 7.25V11M8 5V5.01" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/**
 * render the edge-pick icon
 */
export function EdgeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 11.5L7 4.5L13.5 6.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="4.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

/**
 * render the sun icon
 */
export function SunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
    </svg>
  );
}
/**
 * render the moon icon
 */
export function MoonIcon({ size = 16 }: { size?: number }) {  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5C18.6 16.6 16 18 13 18c-4.4 0-8-3.6-8-8 0-3 .1-5.6 2.2-7C4.8 3.6 3.5 6.6 3.5 10c0 5 4 9 9 9 2.4 0 5.4-1.3 7.5-4.5Z" />
      <path d="M17 4l.6 1.7L19.3 6.3l-1.7.6L17 8.6l-.6-1.7-1.7-.6 1.7-.6L17 4Z" />
    </svg>
  );
}
/**
 * render the save icon
 */
export function SaveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3h11l3 3v15H5V3Z" />
      <path d="M8 3v5h7V3" />
      <rect x="8" y="13" width="8" height="5" rx="1" />
    </svg>
  );
}
/**
 * render the eye icon
 */
export function EyeIcon({ size = 14, off = false }: { size?: number; off?: boolean }) {  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z" stroke="currentColor" strokeWidth={1.4} />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth={1.4} />
      {off && <path d="M2.5 13.5L13.5 2.5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />}
    </svg>
  );
}
