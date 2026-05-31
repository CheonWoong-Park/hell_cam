import { useEffect, useRef } from 'react';

export function useAnimationFrame(callback: (timestamp: number) => void, enabled: boolean) {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tick = (timestamp: number) => {
      callbackRef.current(timestamp);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled]);
}
