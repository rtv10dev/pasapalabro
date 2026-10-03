import { SOUNDS, type Sound } from "./judged-sound";

/**
 * The sounds of the playing Player's phone: the show's Acierto, Fallo and
 * Pasapalabra, and a tick for the last seconds of their Clock, made here.
 *
 * Phones only play audio after a tap, so nothing sounds until unlockAudio()
 * runs from one.
 */

/** The show's sounds, recovered from the Internet Archive (docs/research/official-clues.md). */
const FILES: Record<Sound, string> = {
  hit: "/sounds/acierto.mp3",
  miss: "/sounds/fallo.mp3",
  pasapalabra: "/sounds/paso.mp3",
};

/** The whole seconds left on the Clock that tick. */
const TICK_SECONDS = [5, 4, 3, 2, 1];
const TICK_HZ = 1000;
const TICK_S = 0.08;
const TICK_GAIN = 0.4;

let context: AudioContext | null = null;
const buffers = new Map<Sound, AudioBuffer>();
let tickTimers: number[] = [];
/**
 * The last second that ticked, and when: a new view can set the Clock back a
 * few milliseconds, which must not tick the same second twice.
 */
let lastTick = { second: 0, at: -Infinity };

/**
 * Lets this page play sounds, loading them the first time; called on a tap,
 * the only moment phones allow it. A phone can suspend the audio again when
 * locked, so every tap resumes it.
 */
export function unlockAudio(): void {
  if (context === null) {
    context = new AudioContext();
    load(context);
  }
  if (context.state !== "running") void context.resume();
}

function load(audio: AudioContext): void {
  for (const sound of SOUNDS) {
    void fetch(FILES[sound])
      .then((response) => response.arrayBuffer())
      .then((data) => audio.decodeAudioData(data))
      .then((buffer) => {
        buffers.set(sound, buffer);
      })
      // A sound that doesn't load stays silent; the Match goes on.
      .catch(() => undefined);
  }
}

export function playSound(sound: Sound): void {
  const buffer = buffers.get(sound);
  if (context?.state !== "running" || !buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

/**
 * Ticks at each whole second from 5 to 1 left on a Clock with `clockMs` left
 * now, replacing any ticks to come.
 */
export function tickLastSeconds(clockMs: number): void {
  stopTicks();
  for (const second of TICK_SECONDS) {
    const delay = clockMs - second * 1000;
    if (delay >= 0) {
      tickTimers.push(
        window.setTimeout(() => {
          tick(second);
        }, delay),
      );
    }
  }
}

/** Cancels the ticks to come: the Clock has stopped. */
export function stopTicks(): void {
  for (const timer of tickTimers) window.clearTimeout(timer);
  tickTimers = [];
}

/** A short beep, made with Web Audio. */
function tick(second: number): void {
  const now = performance.now();
  if (second === lastTick.second && now - lastTick.at < 1000) return;
  lastTick = { second, at: now };
  if (context?.state !== "running") return;
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  oscillator.frequency.value = TICK_HZ;
  const gain = context.createGain();
  gain.gain.setValueAtTime(TICK_GAIN, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + TICK_S);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + TICK_S);
}
