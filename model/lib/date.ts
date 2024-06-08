export class WrappedDate {
  private d: Date;

  constructor(date: Date) {
    this.d = date;
  }

  get year(): number {
    return this.d.getFullYear();
  }

  get month() : number {
    return this.d.getMonth() + 1;
  }

  get date(): number {
    return this.d.getDate();
  }

  next(): WrappedDate {
    return new WrappedDate(new Date(this.d.getTime() + 24 * 60 * 60 * 1000));
  }

  prev(): WrappedDate {
    return new WrappedDate(new Date(this.d.getTime() - 24 * 60 * 60 * 1000));
  }

  toString(): string {
    return `${this.year}-${this.month}-${this.date}`;
  }

  equals(other: WrappedDate): boolean {
    return this.year === other.year && this.month === other.month && this.date === other.date;
  }

  static of(year: number, month: number, date: number): WrappedDate {
    return new WrappedDate(new Date(year, month - 1, date));
  }
}

export class DateHour {
  private d: WrappedDate;
  private h: number;

  constructor(date: WrappedDate, hour: number) {
    this.d = date;
    this.h = hour;
  }

  get date(): WrappedDate {
    return this.d;
  }

  get hour(): number {
    return this.h;
  }

  next(): DateHour {
    if (this.h === 23) {
      return new DateHour(this.d.next(), 0);
    } else {
      return new DateHour(this.d, this.h + 1);
    }
  }

  prev(): DateHour {
    if (this.h === 0) {
      return new DateHour(this.d.prev(), 23);
    } else {
      return new DateHour(this.d, this.h - 1);
    }
  }

  toString(): string {
    return `${this.d.toString()}T${this.h < 10 ? '0' : ''}${this.h}`;
  }

  equals(other: DateHour): boolean {
    return this.d.equals(other.d) && this.h === other.h;
  }

  static of(date: Date): DateHour {
    return new DateHour(new WrappedDate(date), date.getHours());
  }
}

const oneMinuteMillis = 60 * 1000;
const oneHourMillis = 60 * oneMinuteMillis;
const oneDayMillis = 24 * oneHourMillis;

export function formatTimeDiff(diff: number): string {
  if (diff < 0) {
    return '0s';
  } else if (diff < oneMinuteMillis) {
    return `${Math.floor(diff / 1000)}s`;
  } else if (diff < oneHourMillis) {
    return `${Math.floor(diff / oneMinuteMillis)}m`;
  } else if (diff < oneDayMillis) {
    return `${Math.floor(diff / oneHourMillis)}h`;
  } else {
    return `${Math.floor(diff / oneDayMillis)}d`;
  }
}
