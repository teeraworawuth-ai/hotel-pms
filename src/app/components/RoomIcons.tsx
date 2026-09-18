import React from 'react';

export const ROOM_ICONS: Record<string, React.ReactNode> = {
  'twin-bed': (
    <svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="2" y="8" width="9" height="10" rx="1" />
      <rect x="13" y="8" width="9" height="10" rx="1" />
      <path d="M2 13h9 M13 13h9 M4 11h5 M15 11h5 M6 8V6a1 1 0 0 1 1-1h1 M17 8V6a1 1 0 0 1 1-1h1" />
    </svg>
  ),
  'window': (
    <svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="5" y="4" width="14" height="16" rx="1" />
      <path d="M12 4v16 M5 12h14" />
      <path d="M2 20h20" strokeWidth="2" />
    </svg>
  ),
  'balcony': (
    <svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <path d="M3 15c0 3 2 5 5 5h8c3 0 5-2 5-5" />
      <path d="M2 15h20" />
      <path d="M8 15v5 M12 15v5 M16 15v5" />
    </svg>
  ),
  'sea-balcony': (
    <svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M2 20h20 M4 16h16 M4 16v4 M12 16v4 M20 16v4" />
      <path d="M3 10c2-1 4-1 6 0s4 1 6 0 4-1 6 0" strokeWidth="1.5" />
      <path d="M3 12c2-1 4-1 6 0s4 1 6 0 4-1 6 0" strokeWidth="1.5" />
    </svg>
  ),
  'house': (
    <svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  'pool-villa': (
    <svg viewBox="0 0 24 24" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M4 12V7l8-4 8 4v5" />
      <path d="M2 16h20v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4z" />
      <path d="M5 19c2-1 4-1 6 0 2 1 4 1 6 0" />
    </svg>
  )
};

export const AVAILABLE_ICONS = Object.keys(ROOM_ICONS);

export function renderIcon(iconId: string, className?: string) {
  const IconNode = ROOM_ICONS[iconId];
  if (IconNode) {
    return <span className={`inline-block ${className || 'w-5 h-5'}`}>{IconNode}</span>;
  }
  // Fallback to emoji if it's an old string in DB
  return <span className={className}>{iconId}</span>;
}
