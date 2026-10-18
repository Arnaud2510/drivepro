import { describe, expect, it } from 'vitest';
import { suggestEmail } from './emailTypos';

describe('suggestEmail', () => {
  it('fixes common provider typos', () => {
    expect(suggestEmail('arno@gmall.com')).toBe('arno@gmail.com');
    expect(suggestEmail('arno@gmial.com')).toBe('arno@gmail.com');
    expect(suggestEmail('arno@gmail.co')).toBe('arno@gmail.com');
    expect(suggestEmail('arno@hotmial.fr')).toBe('arno@hotmail.fr');
  });
  it('leaves correct and unknown domains alone', () => {
    expect(suggestEmail('arno@gmail.com')).toBeNull();
    expect(suggestEmail('arno@monentreprise.ci')).toBeNull();
    expect(suggestEmail('pas-une-adresse')).toBeNull();
  });
});
