export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="24" height="24" rx="4" stroke="currentColor" strokeWidth={1.6} />
      <path d="M7 14H21M14 7V21" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}
