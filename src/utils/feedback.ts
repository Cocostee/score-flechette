export type FeedbackType = "throw" | "bust" | "win";

let audioContext: AudioContext | null = null;

/* Lazily creates (and resumes) a shared audio context on the client. */
function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!audioContext) {
    audioContext = new Ctor();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

/* Plays a single short tone with a quick decay envelope. */
function tone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  peak: number,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
  gain.gain.setValueAtTime(0.0001, context.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak, context.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + start + duration,
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + duration);
}

/* Plays the sound matching a feedback event. */
function playSound(type: FeedbackType): void {
  const context = getContext();
  if (!context) {
    return;
  }
  if (type === "throw") {
    tone(context, 520, 0, 0.07, "triangle", 0.16);
    return;
  }
  if (type === "bust") {
    tone(context, 180, 0, 0.18, "sawtooth", 0.2);
    tone(context, 120, 0.08, 0.2, "sawtooth", 0.18);
    return;
  }
  tone(context, 523, 0, 0.12, "triangle", 0.18);
  tone(context, 659, 0.1, 0.12, "triangle", 0.18);
  tone(context, 784, 0.2, 0.2, "triangle", 0.2);
}

/* Triggers the device vibration matching a feedback event. */
function vibrate(type: FeedbackType): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }
  const pattern =
    type === "win" ? [20, 40, 20, 40, 90] : type === "bust" ? [40, 30, 60] : 12;
  navigator.vibrate(pattern);
}

/* Fires haptic and (unless muted) audio feedback for a game event. */
export function feedback(type: FeedbackType, muted: boolean): void {
  vibrate(type);
  if (!muted) {
    playSound(type);
  }
}
