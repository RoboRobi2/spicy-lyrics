import { $animationFpsCap, $animationFpsCapEnabled } from "./stores.ts";

/**
 * One requestAnimationFrame loop shared by everything that repaints every frame
 * (the lyrics animator and the Kawarp backgrounds), capped by `$animationFpsCap`.
 *
 * Both have to render on the *same* frames: if each capped itself on its own
 * schedule, the page would still be repainted on the union of their frames.
 */

type FrameCallback = (timestamp: number) => void;

const callbacks = new Set<FrameCallback>();

// vsync timestamps jitter by a fraction of a millisecond. Without some slack a
// 60 fps cap on a 60 Hz display would drop every other frame.
const FRAME_SLACK_MS = 1;

// Same bounds and default as the settings slider. The value comes from the
// persisted settings blob, so it is validated rather than trusted.
const MIN_FPS_CAP = 15;
const MAX_FPS_CAP = 240;
const DEFAULT_FPS_CAP = 60;

const computeFrameInterval = (): number => {
  if (!$animationFpsCapEnabled.get()) return 0;
  const saved = Number($animationFpsCap.get());
  const fps = Number.isFinite(saved)
    ? Math.min(MAX_FPS_CAP, Math.max(MIN_FPS_CAP, saved))
    : DEFAULT_FPS_CAP;
  return 1000 / fps;
};

let frameInterval = computeFrameInterval();
const updateFrameInterval = () => {
  frameInterval = computeFrameInterval();
};
$animationFpsCapEnabled.listen(updateFrameInterval);
$animationFpsCap.listen(updateFrameInterval);

let lastRender = -Infinity;

const shouldRender = (timestamp: number): boolean => {
  if (frameInterval === 0) return true;
  const elapsed = timestamp - lastRender;
  if (elapsed < frameInterval - FRAME_SLACK_MS) return false;
  // Keep the phase so a 60 fps cap on a 144 Hz display averages out to 60,
  // but start over after a stall (hidden window, long task) instead of bursting.
  lastRender =
    elapsed >= frameInterval && elapsed < frameInterval * 2
      ? timestamp - (elapsed % frameInterval)
      : timestamp;
  return true;
};

// One-shot callbacks for the next rendered frame (see requestCappedFrame).
let pending = new Map<number, FrameCallback>();
let nextPendingId = 1;

const run = (callback: FrameCallback, timestamp: number) => {
  // One throwing subscriber must not stop the others (or the loop).
  try {
    callback(timestamp);
  } catch (err) {
    console.error("Spicy Lyrics: animation frame callback failed", err);
  }
};

// Sleeping between capped frames.
//
// Requesting an animation frame is not free even when the callback then skips:
// every request makes the browser run a whole frame (style, layerize, commit).
// A trace of a 60 fps cap on a 240 Hz display showed ~230 such frames a second,
// nearly all of them requested by this loop and doing nothing, and Layerize
// alone took ~18% of the renderer's main thread. So with a cap on, the loop
// waits on a timer between rendered frames and asks for a frame only for the
// vsync it will actually draw on.
//
// That needs the vsync period and phase. The period is the shortest gap between
// back-to-back frames over the last few samples; the phase comes from the
// timestamp of the last frame, which is always a vsync.
//
// The loop wakes a quarter period *before* the vsync it wants. A frame requested
// between vsyncs is usually handed out right away, stamped with the vsync that
// just passed, and is then shown on the next one: the target. So that frame is
// rendered as the target frame. If the passed vsync was already used by another
// frame (a scroll, a transition), the request waits for the target vsync itself,
// which is just as right. Waking after the target instead would land one vsync
// late whenever something else had taken it, and the frame pacing would wobble.
//
// A wake that lands further off just skips and asks again back to back, which
// also yields a fresh period sample, so a monitor change corrects itself.
const PERIOD_SAMPLES = 6;
// One back-to-back pair a second keeps the period current even when every wake
// lands right.
const PERIOD_REFRESH_MS = 1000;
// Gaps outside this range are stalls or nonsense, not a vsync period.
const MIN_PERIOD_MS = 2;
const MAX_PERIOD_MS = 50;
// Not worth a timer for less than this; ask for the next frame directly.
const MIN_SLEEP_MS = 1;
// How far ahead of the target vsync to wake, as a share of the period.
const WAKE_BEFORE_VSYNC = 0.25;

const periodSamples: number[] = [];
let vsyncPeriod = 0;
let lastTimestamp = 0;
let backToBack = false;
let nextPeriodRefresh = 0;
// The vsync the pending timer wake is aiming for, or null.
let wakeTarget: number | null = null;

const recordPeriod = (timestamp: number) => {
  const gap = timestamp - lastTimestamp;
  if (gap < MIN_PERIOD_MS || gap > MAX_PERIOD_MS) return;
  periodSamples.push(gap);
  if (periodSamples.length > PERIOD_SAMPLES) periodSamples.shift();
  vsyncPeriod = Math.min(...periodSamples);
};

const requestBackToBack = () => {
  backToBack = true;
  requestAnimationFrame(loop);
};

const scheduleNext = (frameTime: number) => {
  // No cap, no period yet, or a cap close to the display rate: every frame.
  if (frameInterval === 0 || vsyncPeriod === 0 || frameInterval < vsyncPeriod * 1.5) {
    requestBackToBack();
    return;
  }
  if (frameTime >= nextPeriodRefresh) {
    nextPeriodRefresh = frameTime + PERIOD_REFRESH_MS;
    requestBackToBack();
    return;
  }
  // The first vsync at or after the earliest time shouldRender accepts.
  const earliest = lastRender + frameInterval - FRAME_SLACK_MS;
  const vsyncsAhead = Math.max(1, Math.ceil((earliest - frameTime) / vsyncPeriod));
  const target = frameTime + vsyncsAhead * vsyncPeriod;
  const delay = target - WAKE_BEFORE_VSYNC * vsyncPeriod - performance.now();
  if (delay < MIN_SLEEP_MS) {
    requestBackToBack();
    return;
  }
  backToBack = false;
  wakeTarget = target;
  setTimeout(() => requestAnimationFrame(loop), delay);
};

const loop = (timestamp: number) => {
  if (backToBack) recordPeriod(timestamp);
  lastTimestamp = timestamp;
  // A frame stamped with the vsync just before the one the wake aimed for is
  // shown on that one; treat it as the target frame (see above).
  let frameTime = timestamp;
  if (wakeTarget !== null) {
    if (timestamp < wakeTarget && timestamp > wakeTarget - vsyncPeriod * 1.5) {
      frameTime = wakeTarget;
    }
    wakeTarget = null;
  }
  if (shouldRender(frameTime)) {
    for (const callback of callbacks) run(callback, frameTime);
    if (pending.size > 0) {
      // Swap first: callbacks that schedule themselves again land on the next frame.
      const due = pending;
      pending = new Map();
      for (const callback of due.values()) run(callback, frameTime);
    }
  }
  scheduleNext(frameTime);
};

requestAnimationFrame(loop);

/** Run `callback` on every rendered frame. Returns a function that unsubscribes it. */
export function onAnimationFrame(callback: FrameCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

/**
 * requestAnimationFrame, but on the next frame the cap lets through. For
 * JS-driven motion that should not redraw the page more often than the lyrics do.
 */
export function requestCappedFrame(callback: FrameCallback): number {
  const id = nextPendingId++;
  pending.set(id, callback);
  return id;
}

export function cancelCappedFrame(id: number): void {
  pending.delete(id);
}
