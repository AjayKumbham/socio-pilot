
/**
 * IST Time Utilities
 * All IST calculations should use these centralized functions
 */

export const IST_OFFSET_HOURS = 5.5;
export const IST_OFFSET_MS = IST_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Convert UTC date to IST date
 */
export const toIST = (utcDate: Date): Date => {
  return new Date(utcDate.getTime() + IST_OFFSET_MS);
};

/**
 * Convert IST date to UTC date
 */
export const fromIST = (istDate: Date): Date => {
  return new Date(istDate.getTime() - IST_OFFSET_MS);
};

/**
 * Get current IST time
 */
export const getCurrentIST = (): Date => {
  // Always use UTC as the base to avoid double offset
  const nowUTC = new Date(Date.now() + (new Date().getTimezoneOffset() * 60000));
  return toIST(nowUTC);
};

/**
 * Format IST time for display
 */
export const formatISTTime = (utcTime: string | Date, options?: {
  dateStyle?: 'short' | 'medium' | 'long' | 'full';
  timeStyle?: 'short' | 'medium' | 'long' | 'full';
  hour12?: boolean;
}) => {
  const utcDate = typeof utcTime === 'string' ? new Date(utcTime) : utcTime;
  const istDate = toIST(utcDate);
  
  return istDate.toLocaleString('en-IN', {
    timeZone: 'UTC', // We already converted to IST
    dateStyle: options?.dateStyle || 'medium',
    timeStyle: options?.timeStyle || 'medium',
    hour12: options?.hour12 ?? false
  });
};

/**
 * Get start and end of day in IST, converted to UTC
 */
export const getISTDayBoundsUTC = (istDate?: Date) => {
  const currentIST = istDate || getCurrentIST();
  
  // Start of day in IST
  const startOfDayIST = new Date(currentIST);
  startOfDayIST.setHours(0, 0, 0, 0);
  
  // End of day in IST
  const endOfDayIST = new Date(startOfDayIST);
  endOfDayIST.setDate(endOfDayIST.getDate() + 1);
  
  return {
    startUTC: fromIST(startOfDayIST),
    endUTC: fromIST(endOfDayIST)
  };
};
