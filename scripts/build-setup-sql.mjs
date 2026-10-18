// Concatenates the migrations into supabase/drivepro-setup.sql, a single script to paste into
// Supabase › SQL Editor on a new project. Run: npm run db:setup-file
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../supabase/migrations/', import.meta.url);
const parts = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => `-- ===== supabase/migrations/${f} =====\n${readFileSync(new URL(f, dir), 'utf8')}`);
const header = [
  '-- DrivePro — installation complète de la base (toutes les migrations, dans l\'ordre).',
  '-- Généré par `npm run db:setup-file` : ne pas modifier à la main.',
  '-- À coller dans Supabase › SQL Editor › New query, puis Run. Une seule fois, sur un projet neuf.',
  '',
].join('\n');
export const setupSql = header + parts.join('\n');
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  writeFileSync(new URL('../supabase/drivepro-setup.sql', import.meta.url), setupSql);
  console.log('supabase/drivepro-setup.sql written');
}
