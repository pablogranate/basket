import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

// A useState whose initial value comes from localStorage without breaking
// hydration. The server has no storage, so the first client render must match
// the server's: the server snapshot (null) keeps the fallback while hydrating,
// and React swaps in the stored value right after. Reading localStorage in a
// useState initializer instead made every user with saved preferences hit
// React error #418 on /grid.
//
// The setter only changes this component's state, like useState: callers keep
// deciding when to write to localStorage (on toggle, on drag end...).

function subscribeToNothing() {
  return () => {};
}

function readStoredRaw(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredState<T>(
  key: string,
  parse: (raw: string | null) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const raw = useSyncExternalStore(
    subscribeToNothing,
    () => readStoredRaw(key),
    () => null,
  );
  const stored = useMemo(() => parse(raw), [parse, raw]);
  const [changed, setChanged] = useState<{ value: T } | null>(null);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setChanged((previous) => {
        const current = previous ? previous.value : parse(readStoredRaw(key));
        const value =
          typeof next === "function"
            ? (next as (current: T) => T)(current)
            : next;
        return { value };
      });
    },
    [key, parse],
  );

  return [changed ? changed.value : stored, setValue];
}
