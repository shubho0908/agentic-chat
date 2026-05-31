# DNS for AI Discovery (DNS-AID)

This document describes the DNS records required for agent-based discovery of Agentic Chat services per the [DNS-AID draft](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/).

## Overview

DNS-AID enables AI agents to discover service endpoints via DNS without relying solely on HTTP-based well-known URIs. Records are published under the `agents` subdomain using SVCB/HTTPS record types (RFC 9460).

## Required DNS Records

Replace `yourdomain.com` with your actual production domain.

### Index Record (primary discovery entrypoint)

```dns
index.agents.yourdomain.com. 300 IN HTTPS 1 . alpn="h2,h3" endpoint="/.well-known/agent.json"
```

### A2A (Agent-to-Agent) Record

```dns
a2a.agents.yourdomain.com. 300 IN HTTPS 1 . alpn="h2,h3" endpoint="/.well-known/agent.json"
```

### MCP (Model Context Protocol) Record (if applicable)

```dns
mcp.agents.yourdomain.com. 300 IN HTTPS 1 . alpn="h2,h3" endpoint="/.well-known/agent.json"
```

## DNSSEC

Sign the public discovery zone with DNSSEC so validating resolvers return authenticated data. This is typically configured at your DNS provider (e.g., Cloudflare, Route 53, Google Cloud DNS).

## Verification

After publishing records, verify with:

```bash
dig HTTPS index.agents.yourdomain.com
dig HTTPS a2a.agents.yourdomain.com
```

## References

- [DNS-AID Draft](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/)
- [RFC 9460 - SVCB and HTTPS Resource Records](https://www.rfc-editor.org/rfc/rfc9460)
- [Is Agent Ready - DNS-AID Skill](https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md)
