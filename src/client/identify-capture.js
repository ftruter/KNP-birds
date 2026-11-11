// Audio worklet for /identify/sound: passes the microphone's raw samples to
// the page, about a tenth of a second at a time. The samples are at the
// device's own rate; the page resamples them.

const BATCH = 4096

class IdentifyCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.batch = new Float32Array(BATCH)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    let offset = 0
    while (offset < channel.length) {
      const room = Math.min(BATCH - this.filled, channel.length - offset)
      this.batch.set(channel.subarray(offset, offset + room), this.filled)
      this.filled += room
      offset += room
      if (this.filled === BATCH) {
        this.port.postMessage(this.batch.slice())
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('identify-capture', IdentifyCapture)
