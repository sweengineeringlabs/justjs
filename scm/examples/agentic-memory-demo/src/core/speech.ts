// Thin wrapper over the (non-standard, vendor-prefixed-on-some-engines)
// Web Speech API. No @justjs/* SPI involved - this is a browser
// capability, not an app-domain concern, so it's local to this example
// rather than a new package.
export interface SpeechTranscript {
  transcript: string;
  isFinal: boolean;
}

export interface VoicePromptHandle {
  stop(): void;
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const g = globalThis as unknown as Record<string, unknown>;
  const ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as SpeechRecognitionCtor) : null;
}

export function isVoicePromptSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// A curated subset, not every BCP-47 tag a recognition engine might
// support - covers the languages a demo audience is most likely to
// actually pick. "Device default" isn't a real tag; it means "don't
// override recognition.lang, let it fall back to navigator.language".
export const VOICE_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "", label: "Auto" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-ZA", label: "English (South Africa)" },
  { code: "af-ZA", label: "Afrikaans" },
  { code: "zu-ZA", label: "isiZulu" },
  { code: "xh-ZA", label: "isiXhosa" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "it-IT", label: "Italian" },
  { code: "nl-NL", label: "Dutch" },
  { code: "ru-RU", label: "Russian" },
  { code: "ar-SA", label: "Arabic" },
  { code: "hi-IN", label: "Hindi" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "sw-KE", label: "Swahili" },
];

const LANGUAGE_STORAGE_KEY = "justjs:memory-demo:voice-lang";

export function getStoredVoiceLanguage(): string {
  try {
    return globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredVoiceLanguage(code: string): void {
  try {
    if (code) {
      globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, code);
    } else {
      globalThis.localStorage?.removeItem(LANGUAGE_STORAGE_KEY);
    }
  } catch {
    // Best-effort only - the picker still works for this session even
    // if persistence fails (storage disabled/full).
  }
}

// Empty string (either explicitly stored as "Device default" or never
// set) means "don't override recognition.lang" - resolved to
// navigator.language at call time, not cached, so a mid-session OS
// locale change is picked up on the next voice prompt.
function resolveLanguage(explicit: string | undefined): string {
  const chosen = explicit ?? getStoredVoiceLanguage();
  return chosen || navigator.language || "en-US";
}

// Friendlier text for the error codes the spec actually defines
// (https://wicg.github.io/speech-api/#speechreco-error) - falls back to
// the raw code for anything else rather than swallowing it silently.
export function describeVoiceError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied.";
    case "no-speech":
      return "Didn't catch that — try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Voice recognition needs a network connection.";
    case "aborted":
      return "Voice input was cancelled.";
    case "language-not-supported":
      return "That language isn't supported on this device.";
    default:
      return `Voice input error (${code}).`;
  }
}

// Separate API from SpeechRecognition (speech-in) - speech-out doesn't
// touch the microphone at all, so it has none of startVoicePrompt's
// mic-exclusivity concerns (js-runtime#36). Genuinely absent on this
// example's Android WebView target though (window.speechSynthesis is
// undefined there, confirmed via chromiumctl-cli eval, not assumed) -
// a real, separate Android WebView gap, unrelated to js-runtime#36.
// Feature-detected the same way isVoicePromptSupported() is.
export function isTtsSupported(): boolean {
  const g = globalThis as unknown as Record<string, unknown>;
  return typeof g.speechSynthesis === "object" && typeof g.SpeechSynthesisUtterance === "function";
}

const TTS_ENABLED_STORAGE_KEY = "justjs:memory-demo:tts-enabled";

export function getTtsEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(TTS_ENABLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTtsEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(TTS_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Best-effort only, same rationale as setStoredVoiceLanguage.
  }
}

export function speakText(text: string, lang?: string): void {
  if (!isTtsSupported()) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = resolveLanguage(lang);
  speechSynthesis.speak(utterance);
}

export function startVoicePrompt(opts: {
  lang?: string;
  onTranscript: (event: SpeechTranscript) => void;
  onEnd: () => void;
  onError: (code: string) => void;
}): VoicePromptHandle | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return null;
  }
  const recognition = new Ctor();
  recognition.lang = resolveLanguage(opts.lang);
  // Press-and-hold (chat.ts) explicitly starts/stops on pointerdown/up,
  // so the engine shouldn't guess when speech "ended" from a pause -
  // continuous:true keeps listening through pauses in a longer prompt,
  // confirmed on real hardware not to error or misbehave (verified via
  // chromiumctl-cli eval: start -> 1.5s wait -> manual stop() -> clean
  // "ended", no error).
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = "";
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!;
      transcript += result[0].transcript;
      isFinal = isFinal || result.isFinal;
    }
    opts.onTranscript({ transcript, isFinal });
  };
  recognition.onerror = (event) => opts.onError(event.error);
  recognition.onend = () => opts.onEnd();

  recognition.start();
  return {
    stop() {
      recognition.stop();
    },
  };
}
