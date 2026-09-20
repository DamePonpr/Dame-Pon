import React, { useEffect, useRef, useState } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

type GlobalErrorHandlerFunction = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler?: () => GlobalErrorHandlerFunction;
  setGlobalHandler?: (handler: GlobalErrorHandlerFunction) => void;
};

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown global error');
  }
}

export function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);
  const previousHandler = useRef<GlobalErrorHandlerFunction | null>(null);

  useEffect(() => {
    const errorUtils = (globalThis as typeof globalThis & {
      ErrorUtils?: ErrorUtilsLike;
    }).ErrorUtils;

    if (!errorUtils?.setGlobalHandler) return undefined;

    previousHandler.current = errorUtils.getGlobalHandler?.() ?? null;
    errorUtils.setGlobalHandler((rawError, isFatal) => {
      const normalizedError = normalizeError(rawError);
      console.error('[Dame Pon] Global error:', {
        isFatal: Boolean(isFatal),
        message: normalizedError.message,
        stack: normalizedError.stack,
      });
      setError(normalizedError);
    });

    return () => {
      if (previousHandler.current) {
        errorUtils.setGlobalHandler?.(previousHandler.current);
      }
    };
  }, []);

  if (error) {
    return <ErrorFallback error={error} resetError={() => setError(null)} />;
  }

  return <>{children}</>;
}