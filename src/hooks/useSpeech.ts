import { useCallback, useEffect, useRef, useState } from "react";

/* Push to talk: hold the control, speak, release. The transcript streams into
   the body as it arrives and is stored exactly as it comes back — no
   auto-punctuation, no tidying. A silent rewrite would eventually change
   something that was meant.

   On-device processing is requested first, so the audio does not leave the
   machine. Where the browser has no local model the request fails and
   dictation is simply unavailable rather than quietly going to a service. */

type SpeechResult = { transcript: string };
type SpeechAlternatives = { 0: SpeechResult; length: number; isFinal: boolean };
type SpeechEvent = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechAlternatives };
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = {
  new (): Recognition;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export type SpeechState = {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
};

export function useSpeech(onChunk: (text: string) => void): SpeechState {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Recognition | null>(null);
  const chunk = useRef(onChunk);
  chunk.current = onChunk;

  const supported = typeof window !== "undefined" && Boolean(ctor());

  useEffect(() => {
    const C = ctor();
    if (!C) return;
    /* Asking for the on-device model up front means the first hold does not
       stall on a download. */
    void C.install?.({ langs: ["en-US"], processLocally: true }).catch(() => undefined);
    return () => {
      ref.current?.abort();
      ref.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C || ref.current) return;
    const rec = new C();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.processLocally = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) continue;
        const t = r[0].transcript;
        if (t) chunk.current(t);
      }
    };
    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "Microphone access was refused."
          : e.error === "language-not-supported"
            ? "No on-device model is available for this language."
            : e.error,
      );
      setListening(false);
      ref.current = null;
    };
    rec.onend = () => {
      setListening(false);
      ref.current = null;
    };
    try {
      rec.start();
      ref.current = rec;
      setError(null);
      setListening(true);
    } catch {
      setError("Dictation could not start.");
    }
  }, []);

  const stop = useCallback(() => {
    ref.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
