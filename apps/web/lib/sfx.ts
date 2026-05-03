/**
 * Tiny SFX player. HTML5 Audio elements are cached on first call so repeats
 * don't re-fetch. All playback respects browser autoplay policy — the first
 * user gesture (clicking COMMIT) unlocks audio for the rest of the session.
 */

type SfxName = "waiting" | "win" | "loss";

const FILES: Record<SfxName, string> = {
  waiting: "/sfx/waiting.wav",
  win: "/sfx/win.wav",
  loss: "/sfx/loss.wav",
};

const VOLUMES: Record<SfxName, number> = {
  waiting: 0.45,
  win: 0.7,
  loss: 0.6,
};

const cache: Partial<Record<SfxName, HTMLAudioElement>> = {};

function get(name: SfxName): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!cache[name]) {
    const a = new Audio(FILES[name]);
    a.preload = "auto";
    a.volume = VOLUMES[name];
    cache[name] = a;
  }
  return cache[name]!;
}

/** Play a one-shot. Restarts from the beginning if already playing. */
export function playSfx(name: SfxName) {
  const a = get(name);
  if (!a) return;
  try {
    a.loop = false;
    a.currentTime = 0;
    void a.play();
  } catch {
    // browser autoplay block — silently ignored, will work after first user gesture
  }
}

/** Start a looping sound (e.g. the reveal/waiting drone). */
export function startLoop(name: SfxName) {
  const a = get(name);
  if (!a) return;
  try {
    a.loop = true;
    a.currentTime = 0;
    void a.play();
  } catch {
    // ignored
  }
}

/** Stop a sound (whether one-shot or looping). */
export function stopSfx(name: SfxName) {
  const a = cache[name];
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
  } catch {
    // ignored
  }
}
