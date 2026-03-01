#!/usr/bin/env tsx
/**
 * Surinamese Law MCP -- Census-Driven HTML Ingestion Pipeline
 *
 * Reads data/census.json and fetches + parses every ingestable law
 * from wetten.sr (primary) or dna.sr (fallback) as HTML.
 *
 * Pipeline per law:
 *   1. Fetch full HTML page from law URL
 *   2. Parse HTML using the Surinamese law parser (Dutch language)
 *   3. Extract articles, definitions, chapter structure
 *   4. Write seed JSON file to data/seed/
 *
 * Features:
 *   - Resume support: skips laws that already have a seed JSON file
 *   - Census update: writes provision counts + ingestion dates back to census.json
 *   - Checkpoint: saves census state every 50 laws
 *   - Rate limiting: 300ms minimum between requests
 *
 * Usage:
 *   npm run ingest                    # Full census-driven ingestion
 *   npm run ingest -- --limit 5       # Test with 5 laws
 *   npm run ingest -- --skip-fetch    # Reuse cached HTML (re-parse only)
 *   npm run ingest -- --force         # Re-ingest even if seed exists
 *   npm run ingest -- --resume        # Default behavior, explicit flag
 *
 * Data sources:
 *   Primary: wetten.sr (all laws, regulations, treaties)
 *   Fallback: dna.sr (National Assembly)
 *
 * Format: HTML (parsed with regex-based Dutch legal text parser)
 * License: Government Open Data
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseSRLawHtml, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

const USER_AGENT = 'surinamese-law-mcp/1.0 (https://github.com/Ansvar-Systems/Surinamese-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 300;
const CHECKPOINT_INTERVAL = 50;

/* ---------- Types ---------- */

interface CensusLawEntry {
  id: string;
  title: string;
  identifier: string;
  url: string;
  status: 'in_force' | 'amended' | 'repealed';
  category: string;
  classification: 'ingestable' | 'excluded' | 'inaccessible';
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
  issued_date?: string;
  source?: string;
}

interface CensusFile {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  fallback_portal?: string;
  census_date: string;
  agent: string;
  summary: {
    total_laws: number;
    ingestable: number;
    ocr_needed: number;
    inaccessible: number;
    excluded: number;
    from_wetten_sr?: number;
    from_dna_sr?: number;
  };
  laws: CensusLawEntry[];
}

/* ---------- Helpers ---------- */

function parseArgs(): { limit: number | null; skipFetch: boolean; force: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--resume') {
      // Default behavior, accepted for explicitness
    }
  }

  return { limit, skipFetch, force };
}

function censusToActEntry(law: CensusLawEntry): ActIndexEntry {
  const shortName = law.identifier || (law.title.length > 30 ? law.title.substring(0, 27) + '...' : law.title);

  return {
    id: law.id,
    title: law.title,
    titleEn: law.title, // Dutch titles used as-is (no translation)
    shortName,
    status: law.status === 'in_force' ? 'in_force' : law.status === 'amended' ? 'amended' : 'repealed',
    issuedDate: law.issued_date ?? '',
    inForceDate: law.issued_date ?? '',
    url: law.url,
  };
}

/**
 * Fetch an HTML page with rate limiting and retries.
 */
async function fetchHtml(url: string, retries = 3): Promise<{ ok: boolean; html: string; status: number }> {
  await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS));

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html, */*',
          'Accept-Language': 'nl,en;q=0.5',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.log(` HTTP ${response.status}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      }

      const html = await response.text();
      return { ok: response.status === 200, html, status: response.status };
    } catch (err) {
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(` ${msg}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      return { ok: false, html: '', status: 0 };
    }
  }

  return { ok: false, html: '', status: 0 };
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const { limit, skipFetch, force } = parseArgs();

  console.log('Surinamese Law MCP -- Ingestion Pipeline (Census-Driven)');
  console.log('========================================================\n');
  console.log('  Source: wetten.sr / dna.sr');
  console.log('  Format: HTML (Dutch legal text parser)');
  console.log('  License: Government Open Data');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log('  --skip-fetch');
  if (force) console.log('  --force (re-ingest all)');

  // Load census
  if (!fs.existsSync(CENSUS_PATH)) {
    console.error(`\nERROR: Census file not found at ${CENSUS_PATH}`);
    console.error('Run "npx tsx scripts/census.ts" first.');
    process.exit(1);
  }

  const census: CensusFile = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));
  const ingestable = census.laws.filter(l => l.classification === 'ingestable');
  const acts = limit ? ingestable.slice(0, limit) : ingestable;

  console.log(`\n  Census: ${census.summary.total_laws} total, ${ingestable.length} ingestable`);
  console.log(`  Processing: ${acts.length} laws\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  const censusMap = new Map<string, CensusLawEntry>();
  for (const law of census.laws) {
    censusMap.set(law.id, law);
  }

  const today = new Date().toISOString().split('T')[0];

  for (const law of acts) {
    const act = censusToActEntry(law);
    const sourceFile = path.join(SOURCE_DIR, `${act.id}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    // Resume support: skip laws that already have a seed file
    if (!force && fs.existsSync(seedFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
        const provCount = existing.provisions?.length ?? 0;
        const defCount = existing.definitions?.length ?? 0;
        totalProvisions += provCount;
        totalDefinitions += defCount;

        const entry = censusMap.get(law.id);
        if (entry) {
          entry.ingested = true;
          entry.provision_count = provCount;
          entry.ingestion_date = entry.ingestion_date ?? today;
        }

        results.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'resumed' });
        skipped++;
        processed++;
        continue;
      } catch {
        // Corrupt seed file -- re-ingest
      }
    }

    try {
      // Step 1: Fetch HTML
      let html: string;

      if (skipFetch && fs.existsSync(sourceFile)) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        const size = Buffer.byteLength(html, 'utf-8');
        console.log(`  [${processed + 1}/${acts.length}] Using cached ${act.id} (${(size / 1024).toFixed(0)} KB)`);
      } else if (skipFetch) {
        console.log(`  [${processed + 1}/${acts.length}] No cached HTML for ${act.id}, skipping`);
        results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'no-cache' });
        failed++;
        processed++;
        continue;
      } else {
        process.stdout.write(`  [${processed + 1}/${acts.length}] Fetching ${act.id}...`);
        const { ok, html: fetchedHtml, status } = await fetchHtml(act.url);

        if (!ok) {
          console.log(` HTTP ${status}`);
          const entry = censusMap.get(law.id);
          if (entry) entry.classification = 'inaccessible';
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `fetch-failed (HTTP ${status})` });
          failed++;
          processed++;
          continue;
        }

        html = fetchedHtml;
        const size = Buffer.byteLength(html, 'utf-8');
        console.log(` OK (${(size / 1024).toFixed(0)} KB)`);

        // Cache the HTML source
        fs.writeFileSync(sourceFile, html, 'utf-8');
      }

      // Step 2: Parse HTML
      const parsed = parseSRLawHtml(html, act);
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions`);

      // Update census entry
      const entry = censusMap.get(law.id);
      if (entry) {
        entry.ingested = true;
        entry.provision_count = parsed.provisions.length;
        entry.ingestion_date = today;
      }

      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: 'OK',
      });
      ingested++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR parsing ${act.id}: ${msg}`);
      results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 80)}` });
      failed++;
    }

    processed++;

    // Checkpoint: save census every N laws
    if (processed % CHECKPOINT_INTERVAL === 0) {
      writeCensus(census, censusMap);
      console.log(`  [checkpoint] Census updated at ${processed}/${acts.length}`);
    }
  }

  // Final census write
  writeCensus(census, censusMap);

  // Report
  console.log(`\n${'='.repeat(70)}`);
  console.log('Ingestion Report');
  console.log('='.repeat(70));
  console.log(`\n  Source:      wetten.sr / dna.sr (HTML parsing)`);
  console.log(`  Processed:   ${processed}`);
  console.log(`  New:         ${ingested}`);
  console.log(`  Resumed:     ${skipped}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);

  // List failures
  const failures = results.filter(r =>
    r.status.startsWith('fetch') || r.status.startsWith('ERROR') || r.status === 'no-cache',
  );
  if (failures.length > 0) {
    console.log(`\n  Failed laws:`);
    for (const f of failures.slice(0, 30)) {
      console.log(`    ${f.act}: ${f.status}`);
    }
    if (failures.length > 30) {
      console.log(`    ... and ${failures.length - 30} more`);
    }
  }

  // List zero-provision laws
  const zeroProv = results.filter(r => r.provisions === 0 && r.status === 'OK');
  if (zeroProv.length > 0) {
    console.log(`\n  Zero-provision laws (${zeroProv.length}):`);
    for (const z of zeroProv.slice(0, 20)) {
      console.log(`    ${z.act}`);
    }
    if (zeroProv.length > 20) {
      console.log(`    ... and ${zeroProv.length - 20} more`);
    }
  }

  console.log('');
}

function writeCensus(census: CensusFile, censusMap: Map<string, CensusLawEntry>): void {
  census.laws = Array.from(censusMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title, 'nl'),
  );

  census.summary.total_laws = census.laws.length;
  census.summary.ingestable = census.laws.filter(l => l.classification === 'ingestable').length;
  census.summary.inaccessible = census.laws.filter(l => l.classification === 'inaccessible').length;
  census.summary.excluded = census.laws.filter(l => l.classification === 'excluded').length;

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
