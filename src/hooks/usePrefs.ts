import { useCallback, useEffect, useState } from "react";
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from "../lib/prefs";

let shared: Prefs = loadPrefs();
const listeners = new Set<(p: Prefs) => void>();

if (typeof document !== "undefined") applyPrefs(shared);

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setLocal] = useState(shared);

  useEffect(() => {
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  const update = useCallback((patch: Partial<Prefs>) => {
    shared = { ...shared, ...patch };
    savePrefs(shared);
    applyPrefs(shared);
    listeners.forEach((fn) => fn(shared));
  }, []);

  return [prefs, update];
}
