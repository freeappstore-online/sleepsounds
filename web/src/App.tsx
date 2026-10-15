import { useEffect, useState } from 'react'
import { fas } from './fas'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { Mixes } from './player/Mixes'
import { Player } from './player/Player'


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

  const goTo = (href: string) => {
    window.history.pushState(null, '', href)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <Shell app={fas} appName="Sleep Sounds" nav={NAV} onNavigate={navigate}>
      {path === '/mixes' || path === '/about' ? (
        // Text screens scroll inside the app frame; the page itself never does.
        <div className="ss-page">
          <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
            <Screen path={path} navigate={goTo} />
          </div>
          <BuildInfo />
        </div>
      ) : (
        <Player />
      )}
    </Shell>
  )
}

function Screen({ path, navigate }: { path: string; navigate: (href: string) => void }) {
  // Links inside a screen go through history + popstate so the Shell's nav
  // highlight follows along, just like the back button.
  if (path === '/mixes') return <Mixes onOpenSounds={() => navigate('/')} />
  return (
    <>
      <PageHeader title="About" />
      <p className="mt-4 text-[var(--muted)]">
        Sleep Sounds is a noise machine: rain, ocean waves, a stream, wind, a fireplace, a fan, white,
        pink and brown noise, and binaural beats. Tap sounds to mix them and set each one's volume.
        Save favourite mixes by name on the Mixes screen; sign in to have
        them on all your devices. Every sound is generated on your device, so there are no audio files to download and it works
        offline. A sleep timer is on the way.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        Binaural beats are offered as something to listen to, nothing more. Sleep Sounds makes no
        health or medical claims about them or any other sound. They need headphones; keep the volume
        low.
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
}
