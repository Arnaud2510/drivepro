import { describe, expect, it } from 'vitest';
import { isReminderDue, localClock, reminderKey, reminderMessage } from './reminders';

const c = (o = {}) => ({ timezone: 'Europe/Paris', reminderTime: '20:00', dailyReminderEnabled: true, ...o });

describe('daily reminder scheduling', () => {
  it('uses the driver local time', () => {
    // 18:30 UTC = 20:30 in Paris (CEST), 18:30 in Abidjan
    const now = new Date('2026-10-15T18:30:00Z');
    expect(localClock(now, 'Europe/Paris')).toEqual({ date: '2026-10-15', minutes: 20 * 60 + 30 });
    expect(isReminderDue(c(), now)).toBe(true);
    expect(isReminderDue(c({ timezone: 'Africa/Abidjan' }), now)).toBe(false);
    expect(isReminderDue(c({ timezone: 'Africa/Abidjan', reminderTime: '18:00' }), now)).toBe(true);
  });

  it('fires once per hourly run', () => {
    const at = (iso: string) => isReminderDue(c(), new Date(iso));
    expect(at('2026-10-15T17:59:00Z')).toBe(false); // 19:59 Paris
    expect(at('2026-10-15T18:00:00Z')).toBe(true); // 20:00
    expect(at('2026-10-15T18:59:00Z')).toBe(true);
    expect(at('2026-10-15T19:00:00Z')).toBe(false); // 21:00
  });

  it('respects the preference and rejects bad input', () => {
    const now = new Date('2026-10-15T18:10:00Z');
    expect(isReminderDue(c({ dailyReminderEnabled: false }), now)).toBe(false);
    expect(isReminderDue(c({ reminderTime: '8pm' }), now)).toBe(false);
    expect(isReminderDue(c({ timezone: 'Mars/Olympus' }), now)).toBe(false);
  });

  it('dedupes per local date and localises the message', () => {
    expect(reminderKey('2026-10-15')).toBe('push:dailyReminder:2026-10-15');
    expect(reminderMessage('de').title).toBe('Mein Tag');
    expect(reminderMessage('xx')).toEqual(reminderMessage('fr'));
  });
});
