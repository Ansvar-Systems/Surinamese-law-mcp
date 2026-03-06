# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Surinamese bar association rules and the data protection landscape in Suriname.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Advocaten in Suriname are bound by a geheimhoudingsplicht (duty of confidentiality) under the Advocatenwet van Suriname — cloud transmission of client details may breach this duty
- Suriname has **no comprehensive data protection law** — users cannot rely on GDPR or a local equivalent to govern third-party data processors

**Safe Use Options:**
1. **General Legal Research**: Use the Tool for non-client-specific queries about Surinamese legislation
2. **Local npm Package**: Install `@ansvar/surinamese-law-mcp` locally — database queries stay on your machine
3. **Remote Vercel Endpoint**: Queries transit Vercel infrastructure — unsuitable for privileged matters
4. **On-Premise Deployment**: Self-host with a local LLM for client-specific or privileged work

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

The MCP server itself collects nothing. However, the query text passes through whatever AI infrastructure hosts the MCP client session.

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/surinamese-law-mcp
```

- The SQLite database is a local file on your machine
- No data is transmitted to external servers (except to the AI client for LLM processing)
- Full control over data at rest
- Recommended for matters involving client-identifying information

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://surinamese-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure (Vercel Inc., USA)
- Tool responses return through the same path
- Subject to Vercel's privacy policy and US law
- Not appropriate for queries containing client details or case-specific facts

#### 3. On-Premise Deployment

- Self-host the MCP server and a local LLM (e.g., Ollama)
- No data leaves your infrastructure
- Required for classified, highly sensitive, or privilege-critical matters

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters, including any legal terms you enter
- **Tool Responses**: Statute text (wetteksten), provision content, search results drawn from the local database
- **Metadata**: Timestamps and request identifiers managed by the AI client

**What Does NOT Get Transmitted by This Tool:**
- Files on your computer
- Your full conversation history (depends on AI client configuration — check your AI client's settings)
- Any client data (this Tool stores none)

---

## Professional Obligations (Suriname)

### Balie van Advocaten in Suriname

Advocaten practising in Suriname are members of the **Balie van Advocaten in Suriname** and are bound by the professional conduct rules established under the **Advocatenwet van Suriname**. These rules impose obligations that bear directly on the use of cloud-based legal research tools.

#### Geheimhoudingsplicht (Duty of Confidentiality)

The geheimhoudingsplicht requires advocaten to maintain strict confidentiality over all information received in the course of client representation:

- Client identity is confidential in all matters where identification would harm the client
- Case strategy, legal analysis, and factual instructions are protected
- Information that could identify a client or matter must be safeguarded against disclosure to third parties
- Transmission of client-identifying details to a foreign cloud provider (Anthropic, Vercel) may constitute a breach of the geheimhoudingsplicht
- Breach of confidentiality obligations may result in disciplinary proceedings before the Balie van Advocaten

### Duty of Competence

The duty of competence (vakbekwaamheid) requires advocaten to understand the tools they use in legal practice. This includes understanding where query data travels when using AI-assisted research tools, and taking appropriate steps to limit exposure of client information.

---

## Data Protection Law Context (Suriname)

### No Comprehensive Data Protection Law

As of 2026, **Suriname does not have a comprehensive data protection law**. There is no Surinamese equivalent to the GDPR or a dedicated data protection authority with jurisdiction over data processing practices.

This means:

- There is no statutory right to erasure, access, or portability of personal data under Surinamese law
- No formal data processing agreement requirement exists under Surinamese domestic law
- Users cannot compel AI service providers to comply with Surinamese data protection standards, because none currently exist in statute

### Indirect GDPR Exposure

If you process personal data of **EU residents** (for example, advising a Dutch or EU-based client on Surinamese law matters), the **General Data Protection Regulation (GDPR)** may apply to your processing activities as a controller, regardless of your location in Suriname. In that case:

- You would be the **Data Controller** for EU resident personal data
- Anthropic and Vercel may be **Data Processors** requiring a **Data Processing Agreement (DPA)**
- You should assess whether transferring EU resident data to US-based infrastructure satisfies GDPR transfer requirements (Article 46 GDPR)

This is a complex cross-border question. Consult a lawyer with GDPR expertise before processing EU resident data through cloud AI tools.

### Habeas Data Under Surinamese Constitutional Law

Suriname's Grondwet provides general rights of privacy, though these do not translate into detailed statutory data protection obligations comparable to the GDPR. There is no administrative enforcement authority.

### Practical Consequence

The absence of a local data protection law means legal professionals in Suriname must rely on:

1. **Professional conduct rules** (geheimhoudingsplicht under the Advocatenwet) as the primary constraint on data sharing
2. **Contractual terms** with AI service providers (Anthropic's terms of service, Vercel's data processing terms)
3. **Client consent** where appropriate, documented in engagement letters
4. **Deployment architecture choices** — local or on-premise deployment to avoid transmission risk altogether

---

## Risk Assessment by Use Case

### LOW RISK: General Legislative Research

**Safe to use through any deployment:**

```
Example: "What does Article 3 of the Wetboek van Strafrecht van Suriname say about territorial jurisdiction?"
```

- No client identity involved
- No case-specific facts
- Publicly available legislative text

### MEDIUM RISK: Anonymised Queries

**Use with caution — even through cloud deployments:**

```
Example: "What are the penalties for fraud (oplichting) under Surinamese criminal law?"
```

- Query pattern may reveal the nature of a matter you are working on
- Anthropic/Vercel infrastructure logs may associate queries with your API key
- Avoid including details that, in combination, could identify a client or case

### HIGH RISK: Client-Specific Queries

**Do NOT transmit through cloud AI services:**

- Remove ALL identifying details before querying
- Use the local npm package with a self-hosted LLM
- Or conduct research through direct Staatsblad consultation or professional resources with established confidentiality controls

Examples of HIGH RISK query content:
- Client names, company names, or registration numbers
- Specific dates or transaction amounts linked to an identifiable matter
- Case numbers, court file references
- Combinations of details that together identify a client or matter

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only (Surinamese legislation text). No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using the remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

Neither Anthropic nor Vercel is subject to Surinamese law oversight. Assess their terms of service independently.

---

## Recommendations

### For Solo Practitioners (Advocaten met eigen praktijk)

1. Use the local npm package for maximum confidentiality protection
2. Use cloud AI only for non-client-specific general legislative research
3. For client matters, consult the Staatsblad van Suriname directly and document your sources

### For Law Firms (Advocatenkantoren)

1. Establish an internal policy on AI tool use that addresses the geheimhoudingsplicht
2. Train staff on what constitutes safe versus unsafe query content
3. Consider on-premise deployment for matters involving sensitive client information
4. Where EU resident client data is involved, assess GDPR obligations and obtain appropriate data processing agreements with AI providers

### For Corporate Legal Departments (Juridische Afdelingen)

1. Review AI tool use policies against the confidentiality terms in employment contracts and client agreements
2. Use on-premise deployment for internal legal matters involving commercially sensitive information
3. Do not assume Surinamese law provides data protection recourse against foreign AI providers — it does not

### For Government and Public Authorities (Overheid en Overheidsinstanties)

1. Use self-hosted deployment — no external cloud APIs
2. Queries relating to unpublished government decisions or policy positions must not be transmitted to external infrastructure
3. Follow any applicable Surinamese government IT security requirements

---

## Questions and Support

- **Privacy Questions**: Open an issue on [GitHub](https://github.com/Ansvar-Systems/Surinamese-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **Bar Guidance**: Consult the Balie van Advocaten in Suriname for ethics guidance on AI tool use in legal practice

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0
