// Pure logic shared by the daily-reminders Edge Function (Deno) and the unit tests (Vitest).

export interface ReminderCandidate {
  timezone: string;
  reminderTime: string; // HH:MM, local time of the driver
  dailyReminderEnabled: boolean;
}

/** Local calendar date and minutes since midnight of an instant in a time zone. */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * True when the reminder time fell within the last `windowMinutes` (the job runs every hour,
 * so a 60-minute window sends each reminder exactly once; the dedupe key guards re-runs).
 */
export function isReminderDue(c: ReminderCandidate, now: Date, windowMinutes = 60): boolean {
  if (!c.dailyReminderEnabled || !/^\d{2}:\d{2}$/.test(c.reminderTime)) return false;
  const [h, m] = c.reminderTime.split(':').map(Number);
  const target = h * 60 + m;
  let elapsed: number;
  try {
    elapsed = localClock(now, c.timezone).minutes - target;
  } catch {
    return false; // unknown time zone
  }
  return elapsed >= 0 && elapsed < windowMinutes;
}

export const reminderKey = (localDate: string) => `push:dailyReminder:${localDate}`;

const MESSAGES: Record<string, { title: string; body: string }> = {
  fr: { title: 'Ma journée', body: "Vous n'avez pas encore saisi votre journée. Deux minutes suffisent." },
  en: { title: 'My day', body: "You haven't entered today yet. It only takes two minutes." },
  es: { title: 'Mi jornada', body: 'Todavía no has registrado tu jornada. Bastan dos minutos.' },
  pt: { title: 'O meu dia', body: 'Ainda não registou o dia de hoje. Bastam dois minutos.' },
  de: { title: 'Mein Tag', body: 'Sie haben den heutigen Tag noch nicht erfasst. Zwei Minuten genügen.' },
  it: { title: 'La mia giornata', body: 'Non hai ancora inserito la giornata di oggi. Bastano due minuti.' },
};

export function reminderMessage(lang: string) {
  return MESSAGES[lang] ?? MESSAGES.fr;
}
