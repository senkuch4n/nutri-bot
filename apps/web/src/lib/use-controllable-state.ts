"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Estado que puede ser controlado (`prop` definido) o no controlado (`defaultProp`). Los wrappers
 * de Radix + Motion lo usan para saber si el overlay está abierto sin cambiar la API del Root.
 */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T;
  defaultProp: T;
  onChange?: (v: T) => void;
}): [T, (v: T) => void] {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultProp);
  const controlled = prop !== undefined;
  const value = controlled ? (prop as T) : uncontrolled;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback(
    (next: T) => {
      if (!controlled) setUncontrolled(next);
      if (!Object.is(next, valueRef.current)) onChangeRef.current?.(next);
    },
    [controlled],
  );

  return [value, setValue];
}
