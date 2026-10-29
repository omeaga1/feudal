import { useEffect, useState } from "react";

/** useState that remembers its value in localStorage under `key`. Falls back quietly when storage is blocked. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  };
  const [value, setValue] = useState<T>(read);
  // A new key (another civ, say) reads that key's saved value.
  useEffect(() => setValue(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // Not remembered; fine for this session.
    }
  };
  return [value, set];
}

/** Writes a value for a usePersisted key that isn't mounted right now. */
export function savePersisted<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; fine.
  }
}
