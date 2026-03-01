#!/usr/bin/env tsx
/**
 * Surinamese Law MCP -- Census Script
 *
 * Enumerates all laws from wetten.sr (primary) with fallback to dna.sr.
 * Dutch-language portal -- "Alle wetten, verdragen en andere regelingen van Suriname"
 *
 * Pipeline:
 *   1. Scrape wetten.sr listing/category pages with pagination
 *   2. Scrape wetten.sr search results (/?s=wet) as fallback
 *   3. Scrape dna.sr/wetgeving/surinaamse-wetten/ categorical listings
 *   4. Deduplicate and write data/census.json
 *
 * Source: https://wetten.sr/
 * Fallback: https://www.dna.sr/wetgeving/surinaamse-wetten/
 *
 * Usage:
 *   npx tsx scripts/census.ts
 *   npx tsx scripts/census.ts --limit 100
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');

const WETTEN_BASE = 'https://wetten.sr';
const DNA_BASE = 'https://www.dna.sr';

const USER_AGENT = 'surinamese-law-mcp/1.0 (https://github.com/Ansvar-Systems/Surinamese-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;

/* ---------- Types ---------- */

interface RawLawEntry {
  title: string;
  url: string;
  date: string;
  identifier: string;
  source: 'wetten.sr' | 'dna.sr';
  category: string;
}

/* ---------- HTTP Helpers ---------- */

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<{ status: number; body: string; finalUrl: string }> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
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
    const body = await response.text();
    return { status: response.status, body, finalUrl: response.url };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/* ---------- wetten.sr Scraping ---------- */

/**
 * Scrape all law listing pages from wetten.sr.
 * Tries multiple entry points: main listing, category pages, search.
 */
async function scrapeWettenSr(limit: number | null): Promise<RawLawEntry[]> {
  const entries: RawLawEntry[] = [];
  const seenUrls = new Set<string>();

  function addEntry(entry: RawLawEntry): void {
    const normalized = normalizeUrl(entry.url);
    if (!seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      entries.push(entry);
    }
  }

  // Strategy 1: Main listing page with pagination
  const listingPaths = [
    '/wet-regelgeving/',
    '/wetten/',
    '/regelgeving/',
    '/wetgeving/',
    '/',
  ];

  for (const listingPath of listingPaths) {
    if (limit && entries.length >= limit) break;

    let page = 1;
    let hasMore = true;
    let foundAny = false;

    while (hasMore && (!limit || entries.length < limit)) {
      const url = page === 1
        ? `${WETTEN_BASE}${listingPath}`
        : `${WETTEN_BASE}${listingPath}page/${page}/`;

      process.stdout.write(`  wetten.sr${listingPath} page ${page}...`);

      try {
        const { status, body } = await rateLimitedFetch(url);

        if (status !== 200) {
          console.log(` HTTP ${status}`);
          hasMore = false;
          break;
        }

        const pageEntries = parseWettenPage(body);
        console.log(` ${pageEntries.length} entries`);

        if (pageEntries.length === 0) {
          hasMore = false;
          break;
        }

        foundAny = true;
        for (const entry of pageEntries) {
          addEntry(entry);
        }

        hasMore = hasNextPage(body, page);
        page++;

        // Safety cap on pagination
        if (page > 100) hasMore = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(` ERROR: ${msg}`);
        hasMore = false;
      }
    }

    // If the first listing path found results, skip remaining paths
    if (foundAny) break;
  }

  // Strategy 2: WordPress search fallback -- search for common law terms
  if (entries.length < 20) {
    const searchTerms = ['wet', 'decreet', 'besluit', 'staatsblad', 'grondwet', 'wetboek'];

    for (const term of searchTerms) {
      if (limit && entries.length >= limit) break;

      const searchUrl = `${WETTEN_BASE}/?s=${encodeURIComponent(term)}`;
      process.stdout.write(`  wetten.sr search "${term}"...`);

      try {
        const { status, body } = await rateLimitedFetch(searchUrl);
        if (status === 200) {
          const searchEntries = parseWettenPage(body);
          let added = 0;
          for (const entry of searchEntries) {
            const before = seenUrls.size;
            addEntry(entry);
            if (seenUrls.size > before) added++;
          }
          console.log(` ${searchEntries.length} found, ${added} new`);
        } else {
          console.log(` HTTP ${status}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(` ERROR: ${msg}`);
      }
    }
  }

  // Strategy 3: Category pages if the site has them
  if (entries.length < 20) {
    const categoryPaths = [
      '/category/wetten/',
      '/category/decreten/',
      '/category/besluiten/',
      '/category/staatsblad/',
      '/category/grondwet/',
      '/staatsblad/',
      '/decreten/',
      '/besluiten/',
    ];

    for (const catPath of categoryPaths) {
      if (limit && entries.length >= limit) break;

      process.stdout.write(`  wetten.sr${catPath}...`);
      try {
        const { status, body } = await rateLimitedFetch(`${WETTEN_BASE}${catPath}`);
        if (status === 200) {
          const catEntries = parseWettenPage(body);
          let added = 0;
          for (const entry of catEntries) {
            const before = seenUrls.size;
            addEntry(entry);
            if (seenUrls.size > before) added++;
          }
          console.log(` ${catEntries.length} found, ${added} new`);
        } else {
          console.log(` HTTP ${status}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(` ERROR: ${msg}`);
      }
    }
  }

  return limit ? entries.slice(0, limit) : entries;
}

/**
 * Parse a page from wetten.sr for law entries.
 * Uses multiple strategies to find law links in the HTML.
 */
function parseWettenPage(html: string): RawLawEntry[] {
  const entries: RawLawEntry[] = [];
  const seenUrls = new Set<string>();

  function addIfValid(url: string, title: string, category: string): void {
    if (!title || title.length < 5) return;
    const normalized = normalizeUrl(url);
    if (seenUrls.has(normalized)) return;
    if (isNavLink(url, title)) return;
    seenUrls.add(normalized);

    entries.push({
      title: decodeEntities(title),
      url: normalized,
      date: extractDateFromText(title) || '',
      identifier: extractIdentifier(title) || '',
      source: 'wetten.sr',
      category: category || 'wet',
    });
  }

  // 1. article blocks (WordPress post entries)
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch: RegExpExecArray | null;
  while ((articleMatch = articleRe.exec(html)) !== null) {
    const block = articleMatch[1];
    const entry = extractEntryFromBlock(block, 'wetten.sr');
    if (entry) {
      const normalized = normalizeUrl(entry.url);
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        entries.push(entry);
      }
    }
  }

  // 2. h1/h2/h3 headings with links
  const headingLinkRe = /<h[1-6][^>]*>\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-6]>/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingLinkRe.exec(html)) !== null) {
    const href = resolveWettenUrl(headingMatch[1]);
    const title = stripTags(headingMatch[2]).trim();
    addIfValid(href, title, 'wet');
  }

  // 3. li items with links
  const liLinkRe = /<li[^>]*>\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let liMatch: RegExpExecArray | null;
  while ((liMatch = liLinkRe.exec(html)) !== null) {
    const href = resolveWettenUrl(liMatch[1]);
    const title = stripTags(liMatch[2]).trim();
    addIfValid(href, title, 'wet');
  }

  // 4. Table rows with links
  const tdLinkRe = /<td[^>]*>\s*<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let tdMatch: RegExpExecArray | null;
  while ((tdMatch = tdLinkRe.exec(html)) !== null) {
    const href = resolveWettenUrl(tdMatch[1]);
    const title = stripTags(tdMatch[2]).trim();
    addIfValid(href, title, 'wet');
  }

  // 5. All remaining anchor tags with wetten.sr URLs (broad catch-all)
  const allLinkRe = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = allLinkRe.exec(html)) !== null) {
    const rawHref = linkMatch[1];
    const title = stripTags(linkMatch[2]).trim();

    // Accept both absolute wetten.sr URLs and relative paths that look like law pages
    let href: string;
    if (rawHref.match(/^https?:\/\/(?:www\.)?wetten\.sr\//i)) {
      href = rawHref;
    } else if (rawHref.startsWith('/') && !rawHref.startsWith('/wp-') && !rawHref.startsWith('/tag/') && !rawHref.startsWith('/categor')) {
      href = WETTEN_BASE + rawHref;
    } else {
      continue;
    }

    // Skip pagination, home, and listing index links
    if (href.match(/\/page\/\d+\/?$/)) continue;
    if (href === WETTEN_BASE + '/' || href === WETTEN_BASE) continue;
    if (href.match(/\/(wet-regelgeving|wetten|regelgeving|wetgeving)\/?$/)) continue;

    addIfValid(href, title, 'wet');
  }

  return entries;
}

function extractEntryFromBlock(block: string, source: 'wetten.sr' | 'dna.sr'): RawLawEntry | null {
  // Extract first meaningful link from the block
  const linkRe = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
  const linkMatch = linkRe.exec(block);
  if (!linkMatch) return null;

  let href = linkMatch[1];
  const linkText = stripTags(linkMatch[2]).trim();
  if (linkText.length < 5) return null;

  // Make URL absolute
  href = source === 'wetten.sr' ? resolveWettenUrl(href) : resolveDnaUrl(href);

  // Prefer title from heading elements
  const headingRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i;
  const headingMatch = headingRe.exec(block);
  const title = headingMatch
    ? decodeEntities(stripTags(headingMatch[1]).trim())
    : decodeEntities(linkText);

  if (isNavLink(href, title)) return null;

  const blockText = stripTags(block);
  const date = extractDateFromText(blockText) || '';
  const identifier = extractIdentifier(blockText) || extractIdentifier(title) || '';

  return {
    title,
    url: href,
    date,
    identifier,
    source,
    category: 'wet',
  };
}

function resolveWettenUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return WETTEN_BASE + href;
  return WETTEN_BASE + '/' + href;
}

function resolveDnaUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return DNA_BASE + href;
  return DNA_BASE + '/' + href;
}

function normalizeUrl(url: string): string {
  return url
    .replace(/^http:/, 'https:')
    .replace(/\/+$/, '')
    .replace(/^https:\/\/www\./, 'https://')
    .toLowerCase();
}

function hasNextPage(html: string, currentPage: number): boolean {
  const nextPage = currentPage + 1;
  // WordPress-style pagination
  if (html.includes(`/page/${nextPage}/`) || html.includes(`/page/${nextPage}"`)) {
    return true;
  }
  // "next" or "volgende" link
  if (/class="[^"]*next[^"]*"/i.test(html) || /rel="next"/i.test(html)) {
    return true;
  }
  if (/>\s*(?:Volgende|Volg\.|Next|&raquo;|\\u00bb)\s*</i.test(html)) {
    return true;
  }
  return false;
}

/* ---------- dna.sr Fallback Scraping ---------- */

/**
 * Scrape law categories from the National Assembly (dna.sr).
 * Tries multiple paths and sub-pages within each category.
 */
async function scrapeDnaSr(limit: number | null): Promise<RawLawEntry[]> {
  const entries: RawLawEntry[] = [];
  const seenUrls = new Set<string>();

  function addEntry(entry: RawLawEntry): void {
    const normalized = normalizeUrl(entry.url);
    if (!seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      entries.push(entry);
    }
  }

  const categoryPages = [
    `${DNA_BASE}/wetgeving/surinaamse-wetten/`,
    `${DNA_BASE}/wetgeving/surinaamse-wetten/geldende-teksten/`,
    `${DNA_BASE}/wetgeving/surinaamse-wetten/nieuwe-wetten/`,
    `${DNA_BASE}/wetgeving/surinaamse-wetten/wijzigingen/`,
    `${DNA_BASE}/wetgeving/surinaamse-wetten/overeenkomsten/`,
    `${DNA_BASE}/wetgeving/`,
    `${DNA_BASE}/documenten/`,
  ];

  for (const catUrl of categoryPages) {
    if (limit && entries.length >= limit) break;

    const categoryName = catUrl.split('/').filter(Boolean).pop() || 'unknown';
    process.stdout.write(`  dna.sr/${categoryName}...`);

    try {
      const { status, body } = await rateLimitedFetch(catUrl);

      if (status !== 200) {
        console.log(` HTTP ${status}`);
        continue;
      }

      const pageEntries = parseDnaPage(body, categoryName);
      let added = 0;
      for (const entry of pageEntries) {
        const before = seenUrls.size;
        addEntry(entry);
        if (seenUrls.size > before) added++;
      }
      console.log(` ${pageEntries.length} found, ${added} new`);

      // Follow sub-page links within the category
      const subPages = extractSubPages(body, catUrl, DNA_BASE);
      for (const subUrl of subPages) {
        if (limit && entries.length >= limit) break;

        const subName = subUrl.split('/').filter(Boolean).pop() || '';
        process.stdout.write(`    sub: ${subName}...`);
        try {
          const sub = await rateLimitedFetch(subUrl);
          if (sub.status === 200) {
            const subEntries = parseDnaPage(sub.body, categoryName);
            let subAdded = 0;
            for (const entry of subEntries) {
              const before = seenUrls.size;
              addEntry(entry);
              if (seenUrls.size > before) subAdded++;
            }
            console.log(` ${subEntries.length} found, ${subAdded} new`);
          } else {
            console.log(` HTTP ${sub.status}`);
          }
        } catch {
          console.log(' ERROR');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ERROR: ${msg}`);
    }
  }

  return limit ? entries.slice(0, limit) : entries;
}

function parseDnaPage(html: string, category: string): RawLawEntry[] {
  const entries: RawLawEntry[] = [];
  const seenUrls = new Set<string>();

  // Broad link matching for dna.sr
  const linkRe = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    let href = match[1];
    const linkText = stripTags(match[2]).trim();

    // Resolve relative URLs
    if (href.startsWith('/')) {
      href = DNA_BASE + href;
    } else if (!href.startsWith('http')) {
      continue;
    }

    // Only include dna.sr links
    if (!href.match(/(?:www\.)?dna\.sr/i)) continue;

    if (isNavLink(href, linkText)) continue;
    if (linkText.length < 5) continue;

    // Skip index pages
    if (href.match(/\/(surinaamse-wetten|wetgeving)\/?$/)) continue;

    const normalized = normalizeUrl(href);
    if (seenUrls.has(normalized)) continue;
    seenUrls.add(normalized);

    entries.push({
      title: decodeEntities(linkText),
      url: href,
      date: extractDateFromText(linkText) || '',
      identifier: extractIdentifier(linkText) || '',
      source: 'dna.sr',
      category: mapDnaCategory(category),
    });
  }

  return entries;
}

function extractSubPages(html: string, parentUrl: string, baseUrl: string): string[] {
  const subPages: string[] = [];
  const linkRe = /<a\s[^>]*href="([^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith('/')) {
      href = baseUrl + href;
    }

    // Sub-pages within the same category path
    if (href.startsWith(parentUrl) && href !== parentUrl) {
      if (!subPages.includes(href)) {
        subPages.push(href);
      }
    }

    // Pagination links
    if (href.includes('/page/') && href.includes(baseUrl)) {
      if (!subPages.includes(href)) {
        subPages.push(href);
      }
    }
  }

  return subPages.slice(0, 20); // Cap to avoid runaway crawling
}

function mapDnaCategory(category: string): string {
  switch (category) {
    case 'geldende-teksten': return 'geldende_wet';
    case 'nieuwe-wetten': return 'nieuwe_wet';
    case 'wijzigingen': return 'wijziging';
    case 'overeenkomsten': return 'overeenkomst';
    default: return 'wet';
  }
}

/* ---------- Shared Parsing Utilities ---------- */

function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Extract Surinamese law identifiers.
 * Common patterns:
 *   S.B. 2019 no. 14      (Staatsblad van de Republiek Suriname)
 *   G.B. 1975 no. 6       (Gouvernementsblad)
 *   S.B. 2020 no. 157
 *   Wet van dd maand jjjj  (Wet van 15 maart 2005)
 */
function extractIdentifier(text: string): string {
  // S.B. or G.B. pattern
  const sbMatch = text.match(/(?:S\.B\.|G\.B\.)\s*\d{4}\s*(?:no\.\s*\d+|nr\.\s*\d+)/i);
  if (sbMatch) return sbMatch[0].trim();

  // "Wet van" date pattern
  const wetVanMatch = text.match(/Wet\s+van\s+\d{1,2}\s+\w+\s+\d{4}/i);
  if (wetVanMatch) return wetVanMatch[0].trim();

  // Decree patterns
  const decreetMatch = text.match(/(?:Decreet|Besluit|Resolutie)\s+(?:van\s+)?\d{1,2}\s+\w+\s+\d{4}/i);
  if (decreetMatch) return decreetMatch[0].trim();

  return '';
}

/**
 * Extract dates from text.
 * Formats:
 *   dd-mm-yyyy, dd/mm/yyyy
 *   dd maand yyyy (Dutch month names)
 *   yyyy (from S.B. 2019 etc.)
 */
function extractDateFromText(text: string): string {
  // dd-mm-yyyy or dd/mm/yyyy
  const numericMatch = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  // Dutch date: "15 maart 2005"
  const dutchMonths: Record<string, string> = {
    januari: '01', februari: '02', maart: '03', april: '04',
    mei: '05', juni: '06', juli: '07', augustus: '08',
    september: '09', oktober: '10', november: '11', december: '12',
  };

  const dutchDateRe = /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i;
  const dutchMatch = text.match(dutchDateRe);
  if (dutchMatch) {
    const day = dutchMatch[1].padStart(2, '0');
    const month = dutchMonths[dutchMatch[2].toLowerCase()] || '01';
    const year = dutchMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Year from S.B./G.B. reference
  const yearMatch = text.match(/(?:S\.B\.|G\.B\.)\s*(\d{4})/i);
  if (yearMatch) {
    return `${yearMatch[1]}-01-01`;
  }

  return '';
}

function isNavLink(href: string, text: string): boolean {
  const lowerHref = href.toLowerCase();
  const lowerText = text.toLowerCase();

  const navPaths = [
    '/contact', '/over-ons', '/about', '/home', '/zoek', '/search',
    '/tag/', '/author/', '/wp-login', '/feed', '/wp-admin',
    '/wp-content', '/wp-includes', '#', 'javascript:', 'mailto:',
    '/inloggen', '/registr', '/privacy', '/disclaimer',
    '/cookie', '/sitemap', '/comment', '/respond',
  ];

  for (const nav of navPaths) {
    if (lowerHref.includes(nav)) return true;
  }

  const navTexts = [
    'home', 'contact', 'zoeken', 'search', 'menu', 'inloggen',
    'registreren', 'lees meer', 'read more', 'meer info',
    'reageer', 'comment', 'beantwoorden', 'reply',
    'volgende', 'vorige', 'next', 'previous',
  ];

  for (const nav of navTexts) {
    if (lowerText === nav) return true;
  }

  // Skip very short texts that are likely navigation
  if (text.length <= 3 && !/\d/.test(text)) return true;

  return false;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function parseArgs(): { limit: number | null } {
  const args = process.argv.slice(2);
  let limit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { limit };
}

/* ---------- Main ---------- */

async function main(): Promise<void> {
  const { limit } = parseArgs();

  console.log('Surinamese Law MCP -- Census');
  console.log('============================\n');
  console.log('  Primary source:  wetten.sr');
  console.log('  Fallback source: dna.sr/wetgeving/surinaamse-wetten/');
  console.log('  Language:        Dutch');
  if (limit) console.log(`  --limit ${limit}`);
  console.log('');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Phase 1: Scrape wetten.sr (primary)
  console.log('--- Phase 1: wetten.sr ---\n');
  let allEntries: RawLawEntry[] = [];

  try {
    const wettenEntries = await scrapeWettenSr(limit);
    allEntries.push(...wettenEntries);
    console.log(`\n  wetten.sr total: ${wettenEntries.length} laws discovered\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\n  wetten.sr FAILED: ${msg}\n`);
  }

  // Phase 2: Supplement with dna.sr
  // Always try dna.sr to maximize coverage, since Suriname has a small corpus
  console.log('--- Phase 2: dna.sr (supplemental) ---\n');
  try {
    const remainingLimit = limit ? Math.max(0, limit - allEntries.length) : null;
    const dnaEntries = await scrapeDnaSr(remainingLimit);

    // Deduplicate by normalized URL and title similarity
    const existingNormalized = new Set(allEntries.map(e => normalizeUrl(e.url)));
    const existingTitles = new Set(allEntries.map(e => e.title.toLowerCase().trim()));
    let added = 0;
    for (const entry of dnaEntries) {
      const normUrl = normalizeUrl(entry.url);
      const normTitle = entry.title.toLowerCase().trim();
      if (!existingNormalized.has(normUrl) && !existingTitles.has(normTitle)) {
        existingNormalized.add(normUrl);
        existingTitles.add(normTitle);
        allEntries.push(entry);
        added++;
      }
    }
    console.log(`\n  dna.sr total: ${dnaEntries.length} found, ${added} new (after dedup)\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\n  dna.sr FAILED: ${msg}\n`);
  }

  // Apply limit
  if (limit && allEntries.length > limit) {
    allEntries = allEntries.slice(0, limit);
  }

  // Build census entries
  const laws = allEntries.map((entry, idx) => {
    const id = `sr-wet-${idx + 1}-${slugify(entry.title).substring(0, 40)}`;

    return {
      id,
      title: entry.title,
      identifier: entry.identifier || entry.title,
      url: entry.url,
      status: 'in_force' as const,
      category: entry.category || 'wet',
      classification: entry.url ? 'ingestable' as const : 'inaccessible' as const,
      ingested: false,
      provision_count: 0,
      ingestion_date: null as string | null,
      issued_date: entry.date,
      source: entry.source,
    };
  });

  const ingestable = laws.filter(l => l.classification === 'ingestable').length;
  const inaccessible = laws.filter(l => l.classification === 'inaccessible').length;
  const fromWetten = laws.filter(l => l.source === 'wetten.sr').length;
  const fromDna = laws.filter(l => l.source === 'dna.sr').length;

  const census = {
    schema_version: '2.0',
    jurisdiction: 'SR',
    jurisdiction_name: 'Suriname',
    portal: 'wetten.sr',
    fallback_portal: 'dna.sr',
    census_date: new Date().toISOString().split('T')[0],
    agent: 'surinamese-law-mcp/census.ts',
    summary: {
      total_laws: laws.length,
      ingestable,
      ocr_needed: 0,
      inaccessible,
      excluded: 0,
      from_wetten_sr: fromWetten,
      from_dna_sr: fromDna,
    },
    laws,
  };

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2));

  console.log('==================================================');
  console.log('CENSUS COMPLETE');
  console.log('==================================================');
  console.log(`  Total laws discovered:  ${laws.length}`);
  console.log(`  Ingestable:             ${ingestable}`);
  console.log(`  Inaccessible:           ${inaccessible}`);
  console.log(`  From wetten.sr:         ${fromWetten}`);
  console.log(`  From dna.sr:            ${fromDna}`);
  console.log(`\n  Output: ${CENSUS_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
