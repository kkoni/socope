export function getEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function epochSecondsToDate(epochSeconds: number): Date {
  return new Date(epochSeconds * 1000);
}
