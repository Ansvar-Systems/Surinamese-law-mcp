/**
 * Surinamese Law HTML Parser (Dutch language)
 *
 * Parses law text from HTML pages on wetten.sr and dna.sr.
 * Suriname follows the Dutch legal tradition with Dutch language throughout.
 *
 * Article patterns:
 *   "Artikel 1" / "ARTIKEL 1" / "Art. 1"
 *   "Artikel 1a" / "Artikel 1 bis"
 *
 * Structural patterns (Dutch legal hierarchy):
 *   HOOFDSTUK I    (Chapter)
 *   TITEL I        (Title / Part)
 *   AFDELING 1     (Division / Section)
 *   PARAGRAAF 1    (Paragraph / Sub-section)
 *
 * Definition patterns:
 *   "wordt verstaan onder" / "In deze wet wordt verstaan onder"
 *   "wordt/worden ... verstaan:" followed by lettered definitions
 *
 * HTML-only pipeline -- no PDF extraction required.
 */

/* ---------- Types ---------- */

export interface ActIndexEntry {
  id: string;
  title: string;
  titleEn: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate: string;
  inForceDate: string;
  url: string;
  description?: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: string;
  issued_date: string;
  in_force_date: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

/* ---------- HTML Cleaning ---------- */

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&laquo;/g, '\u00AB')
    .replace(/&raquo;/g, '\u00BB')
    .replace(/&eacute;/g, '\u00E9')
    .replace(/&euml;/g, '\u00EB')
    .replace(/&iuml;/g, '\u00EF')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Clean raw HTML into readable plain text for parsing.
 * Preserves paragraph structure by converting block tags to newlines.
 */
function htmlToText(html: string): string {
  let text = html;

  // Convert block elements to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/blockquote>/gi, '\n');

  // Remove remaining tags
  text = stripTags(text);

  // Decode HTML entities
  text = decodeEntities(text);

  // Normalize whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\t/g, ' ');
  text = text.replace(/ {2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Extract the main content area from a full HTML page.
 * Tries to locate the law text container, stripping nav/footer.
 */
function extractContentFromHtml(html: string): string {
  // Try known content selectors (WordPress themes used by .sr sites)
  const contentPatterns = [
    // WordPress post content
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/|<div[^>]*class="[^"]*(?:post-footer|entry-footer|comments))/i,
    // Main content area
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    // Article body
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    // Generic content div
    /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    // Post body
    /<div[^>]*class="[^"]*post-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = pattern.exec(html);
    if (match && match[1] && match[1].length > 200) {
      return match[1];
    }
  }

  // Fallback: strip header/footer/nav and use body
  let content = html;
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  content = content.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  // Try to get body content
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(content);
  if (bodyMatch) {
    return bodyMatch[1];
  }

  return content;
}

/* ---------- Article / Structure Parsing ---------- */

// Dutch article patterns
const ARTICLE_PATTERNS = [
  // "Artikel 1", "ARTIKEL 1", "Art. 1" with optional title after dash/period
  /(?:^|\n)\s*(?:Artikel|ARTIKEL|Art\.?)\s+(\d+[a-z]?(?:\s*bis|\s*ter|\s*quater)?)\s*[.]*[-.:)]*\s*([^\n]*)/gimu,
];

// Structural heading patterns (Dutch legal tradition)
const STRUCTURE_PATTERNS = [
  // HOOFDSTUK I - Algemene bepalingen (Chapter)
  /(?:^|\n)\s*(HOOFDSTUK|Hoofdstuk)\s+([\dIVXLCDM]+[A-Za-z]?)(?:\s*[-.:]\s*|\s+)([^\n]*)/gimu,
  // TITEL I - ... (Title)
  /(?:^|\n)\s*(TITEL|Titel)\s+([\dIVXLCDM]+)(?:\s*[-.:]\s*|\s+)([^\n]*)/gimu,
  // AFDELING 1 - ... (Division)
  /(?:^|\n)\s*(AFDELING|Afdeling)\s+([\dIVXLCDM]+)(?:\s*[-.:]\s*|\s+)([^\n]*)/gimu,
  // PARAGRAAF 1 - ... (Paragraph/Sub-section)
  /(?:^|\n)\s*(PARAGRAAF|Paragraaf|\u00a7)\s+([\dIVXLCDM]+)(?:\s*[-.:]\s*|\s+)([^\n]*)/gimu,
];

// Pattern for individual definition items within a definition block
const DEFINITION_ITEM_RE = /(?:^|\n)\s*(?:[\da-z]+[.)]\s+)?([^:;\n]{3,60}):\s+([^;]*?)(?:[;.]|$)/gim;

interface Heading {
  ref: string;
  title: string;
  position: number;
  type: 'article' | 'structure';
}

interface StructureHeading {
  label: string;
  number: string;
  title: string;
  position: number;
}

/**
 * Parse cleaned plain text from a Surinamese law into provisions.
 */
export function parseSRLawText(text: string, act: ActIndexEntry): ParsedAct {
  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];

  // Find all article headings
  const headings: Heading[] = [];

  for (const pattern of ARTICLE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      const num = match[1].replace(/\s+/g, '').trim();
      const titleText = (match[2] ?? '').trim();
      const ref = `art${num.toLowerCase()}`;

      // Avoid duplicates at same position
      if (!headings.some(h => h.ref === ref && Math.abs(h.position - match!.index) < 30)) {
        headings.push({
          ref,
          title: titleText || `Artikel ${num}`,
          position: match.index,
          type: 'article',
        });
      }
    }
  }

  // Find structural headings (chapters, titles, divisions, paragraphs)
  const structureHeadings: StructureHeading[] = [];
  for (const pattern of STRUCTURE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      structureHeadings.push({
        label: match[1].toUpperCase(),
        number: match[2],
        title: (match[3] ?? '').trim(),
        position: match.index,
      });
    }
  }
  structureHeadings.sort((a, b) => a.position - b.position);

  // Sort article headings by position
  headings.sort((a, b) => a.position - b.position);

  // Determine current chapter/structure for each article
  function getCurrentChapter(pos: number): string {
    let chapter = '';
    for (const sh of structureHeadings) {
      if (sh.position <= pos) {
        if (sh.label === 'HOOFDSTUK' || sh.label === 'TITEL') {
          chapter = `${sh.label} ${sh.number}`;
          if (sh.title) chapter += ` - ${sh.title}`;
        }
      }
    }
    return chapter;
  }

  function getCurrentSection(pos: number): string {
    let section = '';
    for (const sh of structureHeadings) {
      if (sh.position <= pos) {
        section = `${sh.label} ${sh.number}`;
        if (sh.title) section += ` - ${sh.title}`;
      }
    }
    return section || act.title;
  }

  // Extract content between article headings
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];
    const endPos = nextHeading ? nextHeading.position : text.length;
    const rawContent = text.substring(heading.position, endPos).trim();

    // Clean content
    const cleanedContent = rawContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    if (cleanedContent.length > 10) {
      provisions.push({
        provision_ref: heading.ref,
        chapter: getCurrentChapter(heading.position) || undefined,
        section: getCurrentSection(heading.position),
        title: heading.title,
        content: cleanedContent,
      });
    }
  }

  // Extract definitions
  extractDefinitions(text, headings, definitions);

  // Fallback: if no articles found, store entire text as a single provision
  if (provisions.length === 0 && text.length > 50) {
    provisions.push({
      provision_ref: 'full-text',
      section: act.title,
      title: act.title,
      content: text.substring(0, 50000),
    });
  }

  return {
    id: act.id,
    type: 'statute',
    title: act.title,
    title_en: act.titleEn,
    short_name: act.shortName,
    status: act.status,
    issued_date: act.issuedDate,
    in_force_date: act.inForceDate,
    url: act.url,
    provisions,
    definitions,
  };
}

/**
 * Extract definitions from Dutch legal text.
 * Looks for "wordt verstaan onder" blocks and individual "term: definition" pairs.
 */
function extractDefinitions(
  text: string,
  headings: Heading[],
  definitions: ParsedDefinition[],
): void {
  const seenTerms = new Set<string>();

  // Strategy 1: Find "wordt verstaan onder" definition blocks
  const defBlockRe = /(?:(?:wordt|worden)\s+verstaan\s+(?:onder|in))[^:]*:\s*([\s\S]*?)(?=\n\s*(?:Artikel|ARTIKEL|HOOFDSTUK|TITEL)\s|\n\n\n|$)/gim;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = defBlockRe.exec(text)) !== null) {
    const block = blockMatch[1];
    const blockPos = blockMatch.index;

    // Find source provision
    let sourceProvision: string | undefined;
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].position <= blockPos) {
        sourceProvision = headings[i].ref;
        break;
      }
    }

    // Parse individual definition items from the block
    const itemRe = new RegExp(DEFINITION_ITEM_RE.source, DEFINITION_ITEM_RE.flags);
    let itemMatch: RegExpExecArray | null;

    while ((itemMatch = itemRe.exec(block)) !== null) {
      const term = itemMatch[1].trim();
      const definition = itemMatch[2].trim();

      if (
        term.length >= 2 &&
        term.length <= 80 &&
        definition.length >= 5 &&
        !seenTerms.has(term.toLowerCase())
      ) {
        seenTerms.add(term.toLowerCase());
        definitions.push({ term, definition, source_provision: sourceProvision });
      }
    }
  }

  // Strategy 2: Look for "X betekent Y" or "onder X wordt verstaan Y" patterns
  const inlineDefRe = /(?:onder\s+)?"?([^":\n]{3,60})"?\s+(?:wordt\s+verstaan|betekent|houdt\s+in)\s*:?\s+([^.;]{10,200})[.;]/gim;
  let inlineMatch: RegExpExecArray | null;

  while ((inlineMatch = inlineDefRe.exec(text)) !== null) {
    const term = inlineMatch[1].trim().replace(/^"|"$/g, '');
    const definition = inlineMatch[2].trim();

    if (
      term.length >= 2 &&
      term.length <= 80 &&
      definition.length >= 5 &&
      !seenTerms.has(term.toLowerCase())
    ) {
      let sourceProvision: string | undefined;
      for (let i = headings.length - 1; i >= 0; i--) {
        if (headings[i].position <= inlineMatch.index) {
          sourceProvision = headings[i].ref;
          break;
        }
      }
      seenTerms.add(term.toLowerCase());
      definitions.push({ term, definition, source_provision: sourceProvision });
    }
  }
}

/**
 * Parse an HTML page containing a Surinamese law into structured provisions.
 * This is the primary entry point for the ingestion pipeline.
 */
export function parseSRLawHtml(html: string, act: ActIndexEntry): ParsedAct {
  // Extract the content area from the full HTML page
  const contentHtml = extractContentFromHtml(html);

  // Convert HTML to plain text for regex-based parsing
  const text = htmlToText(contentHtml);

  if (!text || text.trim().length < 30) {
    return {
      id: act.id,
      type: 'statute',
      title: act.title,
      title_en: act.titleEn,
      short_name: act.shortName,
      status: act.status,
      issued_date: act.issuedDate,
      in_force_date: act.inForceDate,
      url: act.url,
      provisions: [],
      definitions: [],
    };
  }

  return parseSRLawText(text, act);
}
