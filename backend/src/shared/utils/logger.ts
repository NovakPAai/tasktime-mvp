type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (process.env.LOG_LEVEL ?? '').toLowerCase() as Level;
const minLevel: number =
  LEVEL_ORDER[envLevel] ??
  (process.env.NODE_ENV === 'production' ? LEVEL_ORDER.warn : LEVEL_ORDER.debug);

function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < minLevel) return;
  const payload = { level, msg: message, time: new Date().toISOString(), ...fields };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (process.env.NODE_ENV === 'production') {
    fn(JSON.stringify(payload));
  } else {
    fn(`[${level}] ${message}`, fields ?? '');
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info:  (msg: string, fields?: Record<string, unknown>) => emit('info',  msg, fields),
  warn:  (msg: string, fields?: Record<string, unknown>) => emit('warn',  msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};

export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  const err =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) };
  logger.error('captured_error', { ...context, error: err });
}
