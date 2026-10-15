// Line icons, drawn on a 24px grid with round 1.75px strokes so they read as
// one family. All decorative: the text next to them carries the meaning.

import type { ReactNode } from 'react'
import type { SoundKind } from '../audio/generators'

function Icon({ children, size = 28 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const SOUND_PATHS: Record<SoundKind, ReactNode> = {
  rain: (
    <>
      <path d="M7 15.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 7.5a4 4 0 0 1-.5 8" />
      <path d="M9 18l-1 2.5M13 17l-1 2.5M17 18l-1 2.5" />
    </>
  ),
  waves: (
    <>
      <path d="M2 10c2 0 2.5-2 5-2s3 2 5 2 2.5-2 5-2 3 2 5 2" />
      <path d="M2 15c2 0 2.5-2 5-2s3 2 5 2 2.5-2 5-2 3 2 5 2" />
      <path d="M2 20c2 0 2.5-2 5-2s3 2 5 2 2.5-2 5-2 3 2 5 2" />
    </>
  ),
  stream: (
    <>
      <path d="M12 3.5s-5 5.6-5 9.2a5 5 0 0 0 10 0c0-3.6-5-9.2-5-9.2z" />
      <path d="M10 14.5a2.3 2.3 0 0 0 2 2" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h7a2 2 0 1 1-2 2" />
    </>
  ),
  fire: (
    <>
      <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-3.5-9.5C12 7 10.5 9 10.5 11 9 10 8.5 8.5 8.7 7.3 7 9 6 11.5 6 15a6 6 0 0 0 6 6z" />
      <path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.6 1.5-2.6 2.5-4 1 1.4 2.5 2.4 2.5 4A2.5 2.5 0 0 1 12 21z" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 10.5c-.5-3 0-6.5 2.5-6.5S17 7 13.4 11.3" />
      <path d="M13.3 12.8c2.9 1.1 5.5 3.4 4.3 5.6s-4.1.9-5.1-4.6" />
      <path d="M10.7 12.6c-2.4 1.9-5.7 3.1-6.9.9s1.7-3.8 6.8-2.6" />
      <circle cx="12" cy="12" r="9.5" />
    </>
  ),
  white: <path d="M3 12h1M6 8v8M9 5v14M12 9v6M15 4v16M18 7v10M21 12h0" />,
  pink: <path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2" />,
  brown: (
    <>
      <path d="M2 14c3.5-5 7-5 10 0s6.5 5 10 0" />
      <path d="M2 19h20" opacity="0.5" />
    </>
  ),
  binaural: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <path d="M20 16a2 2 0 0 1-2 2h-1.5v-6H18a2 2 0 0 1 2 2zM4 16a2 2 0 0 0 2 2h1.5v-6H6a2 2 0 0 0-2 2z" />
    </>
  ),
}

export function SoundIcon({ kind, size }: { kind: SoundKind; size?: number }) {
  return <Icon size={size}>{SOUND_PATHS[kind]}</Icon>
}

export function PlayIcon({ size = 34 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}

export function PauseIcon({ size = 34 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1.5" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" />
    </svg>
  )
}

export function StopIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  )
}

export function VolumeIcon({ size = 20, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <Icon size={size}>
      <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
      {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
    </Icon>
  )
}

export function HeadphonesIcon({ size = 20 }: { size?: number }) {
  return <Icon size={size}>{SOUND_PATHS.binaural}</Icon>
}

export function PencilIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </Icon>
  )
}

export function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  )
}
