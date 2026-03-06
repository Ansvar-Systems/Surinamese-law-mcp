/**
 * Response metadata utilities for Surinamese Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Surinamese Law (dna.sr) — National Assembly of Suriname',
    jurisdiction: 'SR',
    disclaimer:
      'This data is sourced from official Surinamese government publications. ' +
      'The authoritative versions are in Dutch. ' +
      'Always verify with the official National Assembly portal (dna.sr).',
    freshness,
  };
}
