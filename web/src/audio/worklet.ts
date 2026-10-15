// AudioWorklet processor: runs one generator on the audio thread. Loaded by
// engine.ts via `audioWorklet.addModule`, so it is bundled on its own and
// must not touch the DOM.

import { Binaural } from './binaural'
import { PROCESSOR_NAME, createGenerator, isSoundKind, type Generator, type SourceMessage } from './generators'

// Globals of AudioWorkletGlobalScope, which TypeScript's DOM lib omits.
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(
  name: string,
  ctor: new (options: { processorOptions?: unknown }) => AudioWorkletProcessor,
): void

interface Options {
  kind?: unknown
  seed?: unknown
  beatHz?: unknown
}

class SleepSoundProcessor extends AudioWorkletProcessor {
  private readonly generator: Generator | null
  private stopped = false

  constructor(options: { processorOptions?: unknown }) {
    super()
    const opts = (options.processorOptions ?? {}) as Options
    const seed = typeof opts.seed === 'number' ? opts.seed : Math.floor(Math.random() * 2 ** 32)
    const beatHz = typeof opts.beatHz === 'number' ? opts.beatHz : undefined
    this.generator = isSoundKind(opts.kind) ? createGenerator(opts.kind, sampleRate, seed, { beatHz }) : null
    this.port.onmessage = (e: MessageEvent<SourceMessage>) => {
      // The engine posts 'stop' after a sound has faded out, letting the
      // processor return false so the browser can free it.
      if (e.data === 'stop') this.stopped = true
      else if (e.data?.type === 'beat' && this.generator instanceof Binaural) this.generator.setBeat(e.data.hz)
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.stopped || !this.generator) return false
    const channels = outputs[0]
    if (!channels || channels.length === 0) return true
    const stereo = this.generator.channels === 2 && channels.length > 1
    this.generator.process(channels[0], stereo ? channels[1] : undefined)
    for (let c = stereo ? 2 : 1; c < channels.length; c++) channels[c].set(channels[0])
    return true
  }
}

registerProcessor(PROCESSOR_NAME, SleepSoundProcessor)
