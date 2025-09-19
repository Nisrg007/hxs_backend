const getTimestamp = (): string => {
  return new Date().toISOString();
};

export const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[${getTimestamp()}] INFO: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  error: (message: string, meta?: any) => {
    console.error(`[${getTimestamp()}] ERROR: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[${getTimestamp()}] WARN: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[${getTimestamp()}] DEBUG: ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
  }
};