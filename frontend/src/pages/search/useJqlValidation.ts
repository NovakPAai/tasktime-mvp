/**
 * TTSRH-1 PR-10 — debounced /search/validate hook.
 *
 * Триггерит `POST /search/validate` через 300ms после последнего keystroke,
 * отменяет in-flight запросы (guard'ит через increment-counter, axios не
 * поддерживает нативный cancel без signal-интеграции).
 *
 * Возвращает:
 *   • `errors` — inline-диагностики {start, end, message} для squiggle-декораций.
 *   • `isValidating` — true пока летит запрос; UI может показать spinner.
 *
 * Инварианты:
 *   • Пустой/whitespace-only JQL не триггерит запрос (очищаем errors).
 *   • Ошибки парсера и валидатора объединяются (у обоих одинаковый формат).
 *   • `isValidating` истинен только для debounced+летящий запросов, не для
 *     локальных переключений. Нет flicker'а при быстром вводе.
 *   • Cleanup при unmount корректно отменяет timer и игнорирует response.
 */
import { useEffect, useRef, useState } from 'react';
import { validateJql } from '../../api/search';
import type { InlineError } from '../../components/search/JqlEditor';

export interface UseJqlValidationResult {
  errors: InlineError[];
  isValidating: boolean;
}

export function useJqlValidation(
  value: string,
  opts: { debounceMs?: number; variant?: 'default' | 'checkpoint' } = {},
): UseJqlValidationResult {
  // Destructure to primitives so the effect dep array doesn't depend on the `opts`
  // object identity — inline objects at the call site would otherwise break debouncing.
  const { debounceMs = 300, variant } = opts;
  const [errors, setErrors] = useState<InlineError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    // Empty query — clear errors, skip request.
    if (value.trim().length === 0) {
      setErrors([]);
      setIsValidating(false);
      return;
    }

    const handle = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setIsValidating(true);
      void validateJql(value, variant)
        .then((res) => {
          // Stale response — a newer request already fired.
          if (reqId !== reqIdRef.current) return;
          const all = [...res.errors, ...res.warnings];
          setErrors(
            all.map((e) => ({
              start: e.start,
              end: e.end,
              message: e.message,
            })),
          );
          setIsValidating(false);
        })
        .catch(() => {
          if (reqId !== reqIdRef.current) return;
          // Network/5xx — clear errors (not a validation error, just "unknown").
          setErrors([]);
          setIsValidating(false);
        });
    }, debounceMs);

    return () => {
      clearTimeout(handle);
      // Bump reqId so any in-flight response is treated as stale.
      reqIdRef.current += 1;
    };
  }, [value, debounceMs, variant]);

  return { errors, isValidating };
}
