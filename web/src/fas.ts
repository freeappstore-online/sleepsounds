// The app's one FreeAppStore client (auth, kv and the rest).

import { initApp } from '@freeappstore/sdk'

export const fas = initApp({ appId: 'sleepsounds' })
