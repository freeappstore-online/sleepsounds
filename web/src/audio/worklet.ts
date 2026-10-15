// AudioWorklet processor: runs one generator on the audio thread. Loaded by
// engine.ts via `audioWorklet.addModule`, so it is bundled on its own and
// must not touch the DOM.

import { PROCESSOR_NAME, createGenerator, isSoundKind, type Generator } from './generators'

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
}

class SleepSoundProcessor extends AudioWorkletProcessor {
  private readonly generator: Generator | null
  private stopped = false

  constructor(options: { processorOptions?: unknown }) {
    super()
    const opts = (options.processorOptions ?? {}) as Options
    const seed = typeof opts.seed === 'number' ? opts.seed : Math.floor(Math.random() * 2 ** 32)
    this.generator = isSoundKind(opts.kind) ? createGenerator(opts.kind, sampleRate, seed) : null
    // The engine posts 'stop' after a sound has faded out, letting the
    // processor return false so the browser can free it.
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data === 'stop') this.stopped = true
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.stopped || !this.generator) return false
    const channels = outputs[0]
    if (!channels || channels.length === 0) return true
    this.generator.process(channels[0])
    for (let c = 1; c < channels.length; c++) channels[c].set(channels[0])
    return true
  }
}

registerProcessor(PROCESSOR_NAME, SleepSoundProcessor)
