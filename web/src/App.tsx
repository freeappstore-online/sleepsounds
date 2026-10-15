import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { BinauralPanel } from './BinauralPanel'

const fas = initApp({ appId: 'sleepsounds' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Sounds', href: '/', title: 'Sounds — Sleep Sounds' },
  { label: 'Mixes', href: '/mixes', title: 'Mixes — Sleep Sounds' },
  { label: 'About', href: '/about', title: 'About — Sleep Sounds' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  return (
    <Shell app={fas} appName="Sleep Sounds" nav={NAV} onNavigate={navigate}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
        <Screen path={path} />
      </div>
      <BuildInfo />
    </Shell>
  )
}

function Screen({ path }: { path: string }) {
  switch (path) {
    case '/mixes':
      return (
        <>
          <PageHeader title="Mixes" description="Save the sounds you like together and come back to them." />
          <ComingSoon />
        </>
      )
    case '/about':
      return (
        <>
          <PageHeader title="About" />
          <ComingSoon />
          <p className="mt-4 text-[var(--muted)]">
            Sleep Sounds will be a noise machine: white, pink and brown noise, rain, ocean waves,
            wind, a fan, a fireplace and a stream, mixed however you like with a sleep timer. Every
            sound will be generated on your device, so there are no audio files to download and it
            works offline.
          </p>
          <p className="mt-4 text-[var(--muted)]">
            Binaural beats are offered as something to listen to, nothing more. Sleep Sounds makes
            no health or medical claims about them or any other sound. They need headphones; keep the
            volume low.
          </p>
          <p className="mt-4 text-[var(--muted)]">
            Sleep Sounds is a free, MIT-licensed app on{' '}
            <a href="https://freeappstore.online" className="underline">
              FreeAppStore
            </a>
            .
          </p>
        </>
      )
    default:
      return (
        <>
          <PageHeader title="Sounds" description="White noise, rain, ocean and more, with a sleep timer." />
          <BinauralPanel />
          <p className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
            More sounds are coming soon: noise, rain, ocean waves, wind, a fan, a fireplace and a
            stream.
          </p>
        </>
      )
  }
}

// Placeholder body until the screens are built. Nothing plays yet, so it says
// so plainly.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Coming soon. Sleep Sounds is in development; it doesn't play any sounds yet.
    </p>
  )
}
