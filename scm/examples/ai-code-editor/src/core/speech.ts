// Thin wrapper over the (non-standard, vendor-prefixed-on-some-engines)
// Web Speech API. No @justjs/* SPI involved - this is a browser
// capability, not an app-domain concern. Ported from
// agentic-memory-demo/src/core/speech.ts - voice input only, not that
// app's full surface. Deliberately NOT ported: VOICE_LANGUAGES / the
// paginated language-picker UI, and the TTS (speech-out) API - this app
// only asked for voice input, not a language override or read-aloud
// replies. startVoicePrompt() is always called with no explicit `lang`,
// falling through to navigator.language.
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
  recognition.lang = opts.lang || navigator.language || "en-US";
  // Press-and-hold callers explicitly start/stop on pointerdown/up, so
  // the engine shouldn't guess when speech "ended" from a pause -
  // continuous:true keeps listening through pauses in a longer prompt
  // (same setting agentic-memory-demo/src/core/speech.ts uses, confirmed
  // there on real hardware via chromiumctl-cli eval: start -> 1.5s wait
  // -> manual stop() -> clean "ended", no error).
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
