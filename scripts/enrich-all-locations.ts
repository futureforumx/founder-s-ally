/**
 * enrich-all-locations.ts
 *
 * Master script that runs the complete location enrichment pipeline:
 * 1. Enrich missing location data
 * 2. Validate for data quality issues
 * 3. Normalize country names
 * 4. Generate summary report
 *
 * Run: npx tsx scripts/enrich-all-locations.ts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const scripts = [
  { name: 'enrich-firm-locations.ts', desc: '🌍 Enriching missing location data' },
  { name: 'validate-firm-locations.ts', desc: '✓ Validating location data quality' },
  { name: 'normalize-firm-countries.ts', desc: '📋 Normalizing country names' },
  { name: 'report-firm-locations.ts', desc: '📊 Generating coverage report' },
];

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('   Firm Location Enrichment Pipeline');
  console.log('='.repeat(60) + '\n');

  for (const script of scripts) {
    console.log(`\n${script.desc}…\n`);
    try {
      execSync(`npx tsx scripts/${script.name}`, {
        cwd: process.cwd(),
        stdio: 'inherit',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e) {
      console.error(`\n❌ Error running ${script.name}`);
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('   ✅ All enrichment steps completed successfully!');
  console.log('='.repeat(60) + '\n');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
