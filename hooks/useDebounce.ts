import { useEffect, useRef, useCallback } from 'react';

export function useThrottle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        callbackRef.current(...args);
        lastRunRef.current = now;
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(
          () => {
            callbackRef.current(...args);
            lastRunRef.current = Date.now();
          },
          delay - timeSinceLastRun
        );
      }
    },
    [delay]
  );
}
