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
    default:
      return `Voice input error (${code}).`;
  }
}

export function startVoicePrompt(opts: {
  onTranscript: (event: SpeechTranscript) => void;
  onEnd: () => void;
  onError: (code: string) => void;
}): VoicePromptHandle | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return null;
  }
  const recognition = new Ctor();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = false;
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
