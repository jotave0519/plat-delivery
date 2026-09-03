"use client";

/**
 * A short, professional "new order" chime — synthesized with the Web Audio
 * API instead of an audio file, since this project has no asset pipeline
 * and shipping a binary just for this would be the heavier option. Two
 * quick ascending tones with a soft attack/decay envelope, done in ~350ms.
 *
 * Browsers block audio playback until the page has had a user gesture
 * (click/tap/key press) — `unlockAudio()` primes the AudioContext on the
 * first such gesture; `playNewOrderChime()` is a no-op (never throws) if
 * the context isn't unlocked yet or audio otherwise fails, so a
 * notification arriving before the user has touched the page just skips
 * the sound rather than breaking anything.
 */

let audioContext: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/** Call once, from a real user gesture (click/touchstart/keydown) — see order-notifications-provider.tsx. */
export function unlockAudio() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  unlocked = true;
}

function tone(ctx: AudioContext, frequency: number, startAt: number, durationSec: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  // Quick fade in, gentle fade out — avoids a harsh click at either edge.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.22, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec);
}

export function playNewOrderChime() {
  if (!unlocked) return;
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    tone(ctx, 880, now, 0.15); // A5
    tone(ctx, 1174.66, now + 0.13, 0.2); // D6 — a clean fifth up, reads as "notification", not alarm
  } catch {
    // Never let a sound failure break the notification flow.
  }
}
