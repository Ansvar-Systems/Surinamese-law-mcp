# Surinamese Law MCP Server

**Het wetten.sr-alternatief voor het AI-tijdperk.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fsurinamese-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/surinamese-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Surinamese-law-mcp?style=social)](https://github.com/Ansvar-Systems/Surinamese-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Surinamese-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Surinamese-law-mcp/actions/workflows/ci.yml)
[![Statutes](https://img.shields.io/badge/statutes-623-blue)]()

Query **623 Surinamese statutes** -- from the Burgerlijk Wetboek and Wetboek van Strafrecht to the Arbeidswet, Bankwet, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Surinamese legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Surinaams juridisch onderzoek betekent navigeren door wetten.sr, het handmatig doorzoeken van PDF-versies van wetgeving en het traceren van wijzigingen via de Staatscourant van Suriname. Of u nu:

- Een **advocaat** bent die citaten valideert in een conclusie of contract voor Surinaamse rechtbanken
- Een **compliance officer** bent die verplichtingen controleert onder de Wet Bescherming Persoonsgegevens of arbeidswetgeving
- Een **legal tech ontwikkelaar** bent die tools bouwt voor de Surinaamse of Caribische markt
- Een **onderzoeker** bent die wetgeving bestudeert door 623 Surinaamse wetten

...u hoeft geen tientallen browsertabbladen open te houden of handmatig te kruisverwijzen. Vraag het aan Claude. Ontvang de exacte bepaling. Met context.

This MCP server makes Surinamese law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://surinamese-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add surinamese-law --transport http https://surinamese-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "surinamese-law": {
      "type": "url",
      "url": "https://surinamese-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "surinamese-law": {
      "type": "http",
      "url": "https://surinamese-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/surinamese-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "surinamese-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/surinamese-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "surinamese-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/surinamese-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally (Dutch examples):

- *"Wat zegt het Burgerlijk Wetboek van Suriname over contractuele aansprakelijkheid?"*
- *"Welke verplichtingen gelden voor werkgevers onder de Arbeidswet?"*
- *"Zoek bepalingen over bescherming van persoonsgegevens in de Surinaamse wetgeving"*
- *"Is de Bankwet nog van kracht? Zijn er recente wijzigingen?"*
- *"Wat bepaalt het Wetboek van Strafrecht over fraude en oplichting?"*
- *"Welke vereisten stelt de Handelswet aan het oprichten van een naamloze vennootschap?"*
- *"Valideer de verwijzing naar 'Wet van 15 april 1982, Arbeidswet'"*
- *"Bouw een juridisch standpunt op over arbeidsrechtelijke ontslagbescherming in Suriname"*
- *"Welke wetten regelen de mijnbouwactiviteiten en natuurlijke rijkdommen in Suriname?"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 623 statutes | Comprehensive Surinamese legislation from wetten.sr |
| **Provisions** | Parsing in progress | Full-text search available on indexed content |
| **Database Size** | ~0.5 MB | Optimized SQLite, portable |
| **Freshness Checks** | Automated | Drift detection against wetten.sr |

> **Note on provision parsing:** The Surinamese statute database contains 623 laws indexed from wetten.sr. Full provision-level parsing is ongoing -- the current build supports statute-level search and retrieval. Provision count will grow as parsing is completed in future releases.

**Verified data only** -- every citation is validated against official sources (wetten.sr). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from [wetten.sr](https://www.wetten.sr) -- the official Surinamese legal database maintained by the government
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by statute identifier + chapter/article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
wetten.sr --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                ^                        ^
         Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search wetten.sr by statute name | Search by plain Dutch: *"bescherming persoonsgegevens"* |
| Navigate multi-article codes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is deze wet nog van kracht?" → handmatig controleren | `check_currency` tool → antwoord in seconden |
| Find international basis → dig through OAS/CARICOM | `get_eu_basis` → linked international instruments |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Search wetten.sr → Download PDF → Ctrl+F → Cross-reference met Burgerlijk Wetboek → Herhalen

**This MCP:** *"Wat zijn de ontslaggronden onder de Surinaamse Arbeidswet en welke vergoedingen gelden?"* → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across indexed Surinamese provisions with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by statute identifier + article/section number |
| `check_currency` | Check if a statute is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple statutes for a legal topic |
| `format_citation` | Format citations per Surinamese legal conventions |
| `list_sources` | List all available statutes with metadata and coverage scope |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international instruments (CARICOM, OAS, ILO, Dutch Kingdom agreements) that a Surinamese statute aligns with |
| `get_surinamese_implementations` | Find Surinamese laws aligning with a specific international instrument |
| `search_eu_implementations` | Search international documents with Surinamese implementation counts |
| `get_provision_eu_basis` | Get international law references for a specific provision |
| `validate_eu_compliance` | Check alignment status of Surinamese statutes against international standards |

---

## International Law Alignment

Suriname is not an EU member state, but Surinamese law intersects with several international frameworks -- including some with direct Dutch heritage:

- **Dutch legal tradition** -- Surinamese civil and commercial law derives substantially from Dutch law; the Burgerlijk Wetboek and Wetboek van Strafrecht share historical roots with Dutch equivalents, though Suriname has developed its own legislative path since independence (1975)
- **CARICOM** -- Suriname is a CARICOM member; trade, investment, and free movement frameworks align with CARICOM agreements
- **OAS** -- Suriname participates in OAS conventions on human rights, anti-corruption, and regional cooperation; the American Convention on Human Rights applies
- **ILO Conventions** -- Suriname has ratified core ILO conventions; the Arbeidswet and related labor statutes reflect these obligations
- **FATF/CFATF** -- Suriname participates in the Caribbean FATF; AML/CFT legislation aligns with FATF recommendations
- **UN Frameworks** -- Criminal law, environmental, and maritime statutes reflect UN treaty obligations

The international alignment tools allow you to explore these relationships -- checking which Surinamese provisions correspond to treaty obligations or Dutch legal traditions, and vice versa.

> **Note:** International cross-references reflect alignment and treaty relationships. Surinamese law has evolved its own distinct path since 1975, and the tools help identify where Surinamese and international frameworks address similar domains.

---

## Data Sources & Freshness

All content is sourced from authoritative Surinamese legal databases:

- **[wetten.sr](https://www.wetten.sr)** -- Official Surinamese government legal database (primary source)
- **[De Nationale Assemblee van Suriname](https://www.assemblee.sr)** -- National Assembly official portal
- **[Staatscourant van Suriname](https://www.kabinet.sr)** -- Official gazette for promulgated legislation

### Data Provenance

| Field | Value |
|-------|-------|
| **Primary source** | wetten.sr |
| **Retrieval method** | Structured ingestion from official government sources |
| **Language** | Dutch (official language of Suriname) |
| **Coverage** | 623 Surinamese statutes |
| **Database size** | ~0.5 MB |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from wetten.sr and official Surinamese government sources. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Provision parsing is ongoing** -- full provision-level extraction is incomplete in this release
> - **Verify critical citations** against primary sources (Staatscourant) for formal proceedings
> - **International cross-references** reflect alignment relationships, not formal transposition
> - **District and local legislation is not included** -- this covers national statutes only

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

### Professional Responsibility

Members of the **Surinaamse Orde van Advocaten** should ensure any AI-assisted research complies with professional ethics rules on competence and verification of sources before relying on output in client matters or court filings.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Surinamese-law-mcp
cd Surinamese-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest           # Ingest statutes from wetten.sr
npm run build:db         # Rebuild SQLite database
npm run drift:detect     # Run drift detection against anchors
npm run check-updates    # Check for source updates
npm run census           # Generate coverage census
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~0.5 MB (efficient, portable)
- **Reliability:** 100% statute indexing from wetten.sr

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/dutch-law-mcp](https://github.com/Ansvar-Systems/Dutch-law-mcp)
**Query Dutch statutes directly from Claude** -- shared legal heritage and comparative reference. `npx @ansvar/dutch-law-mcp`

### [@ansvar/guyanese-law-mcp](https://github.com/Ansvar-Systems/Guyanese-law-mcp)
**Query Guyanese law directly from Claude** -- Caribbean legal research companion. `npx @ansvar/guyanese-law-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Brazil, Canada, Colombia, Cuba, Denmark, France, Germany, Guyana, Honduras, Ireland, Netherlands, Nicaragua, Norway, Panama, El Salvador, Sweden, UK, Venezuela, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Full provision-level parsing (current database has statute-level indexing)
- Court case law coverage (Hof van Justitie)
- Staatscourant amendment tracking
- CARICOM treaty cross-reference mapping

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Full corpus indexing (623 statutes from wetten.sr)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Full provision-level parsing
- [ ] Court case law coverage
- [ ] Staatscourant automated amendment tracking
- [ ] Historical statute versions
- [ ] CARICOM framework cross-references

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{surinamese_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Surinamese Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Surinamese-law-mcp},
  note = {623 Surinamese statutes with international law alignment and Dutch-language search}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Surinamese Government (public domain via wetten.sr)
- **International Metadata:** OAS/ILO/CARICOM public domain

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server extends our coverage to the Dutch-speaking Caribbean -- because navigating 623 Surinamese statutes across fragmented portals shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
