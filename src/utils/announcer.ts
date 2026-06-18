/* Speaks a short call in French, when the voice announcer is enabled. */
export function speak(text: string, enabled: boolean): void {
  if (!enabled || typeof window === "undefined") {
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    return;
  }
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = 1;
    utterance.pitch = 1;
    synth.speak(utterance);
  } catch {
    return;
  }
}
