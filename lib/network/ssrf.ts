import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

const BLOCKED_IPV4_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

const BLOCKED_IPV6_PREFIXES = [
  '::',
  '::1',
  'fc',
  'fd',
  'fe80',
] as const;

export interface SafeResolvedUrl {
  url: URL;
  hostname: string;
  resolvedAddresses: Array<{
    address: string;
    family: 4 | 6;
  }>;
}

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((value, octet) => (((value << 8) >>> 0) + Number(octet)) >>> 0, 0) >>> 0;
}

function isIpv4InRange(ip: string, range: readonly [string, number]): boolean {
  const [baseIp, prefixLength] = range;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(baseIp) & mask);
}

function normalizeIpAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  return trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function ipv4MappedIpv6ToIpv4(address: string): string | null {
  const normalized = normalizeIpAddress(address);
  const prefix = '::ffff:';

  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const mapped = normalized.slice(prefix.length);
  if (net.isIP(mapped) === 4) {
    return mapped;
  }

  const parts = mapped.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.');
}

function isPrivateAddress(address: string): boolean {
  const normalizedAddress = normalizeIpAddress(address);
  const mappedIpv4 = ipv4MappedIpv6ToIpv4(normalizedAddress);

  if (mappedIpv4) {
    return BLOCKED_IPV4_CIDRS.some((range) => isIpv4InRange(mappedIpv4, range));
  }

  const ipVersion = net.isIP(normalizedAddress);

  if (ipVersion === 4) {
    return BLOCKED_IPV4_CIDRS.some((range) => isIpv4InRange(normalizedAddress, range));
  }

  if (ipVersion === 6) {
    return BLOCKED_IPV6_PREFIXES.some((prefix) => normalizedAddress.startsWith(prefix));
  }

  return false;
}

export async function assertSafePublicUrl(
  input: string | URL,
  options?: {
    allowHosts?: string[];
  }
): Promise<SafeResolvedUrl> {
  const url = new URL(typeof input === 'string' ? input : input.toString());

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are allowed');
  }

  if (url.username || url.password) {
    throw new Error('Authenticated URLs are not allowed');
  }

  const hostname = url.hostname.toLowerCase();
  const normalizedHostname = normalizeIpAddress(hostname);
  const allowHosts = new Set((options?.allowHosts ?? []).map((host) => host.toLowerCase()));

  if ((BLOCKED_HOSTNAMES.has(normalizedHostname) || normalizedHostname.endsWith('.internal')) && !allowHosts.has(normalizedHostname)) {
    throw new Error('Requests to local or metadata hosts are not allowed');
  }

  if (net.isIP(normalizedHostname)) {
    if (isPrivateAddress(normalizedHostname) && !allowHosts.has(normalizedHostname)) {
      throw new Error('Requests to private network addresses are not allowed');
    }
    return {
      url,
      hostname: normalizedHostname,
      resolvedAddresses: [{ address: normalizedHostname, family: net.isIP(normalizedHostname) as 4 | 6 }],
    };
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('Unable to resolve URL hostname');
  }

  for (const address of addresses) {
    if (isPrivateAddress(address.address) && !allowHosts.has(hostname)) {
      throw new Error('Resolved address points to a private network target');
    }
  }

  return {
    url,
    hostname,
    resolvedAddresses: addresses.map((address) => ({
      address: address.address,
      family: address.family as 4 | 6,
    })),
  };
}

function matchesHostPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1).toLowerCase();
    return hostname.toLowerCase().endsWith(suffix);
  }

  return hostname.toLowerCase() === pattern.toLowerCase();
}

export function isTrustedAttachmentUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const trustedOrigins = [
      'localhost',
      '127.0.0.1',
      '*.ufs.sh',
      '*.uploadthing.com',
      'utfs.io',
    ];

    const extraHosts = (process.env.TRUSTED_ATTACHMENT_HOSTS ?? '')
      .split(',')
      .flatMap((host) => { const h = host.trim(); return h ? [h] : []; });

    return [...trustedOrigins, ...extraHosts].some((pattern) =>
      matchesHostPattern(hostname, pattern)
    );
  } catch {
    return false;
  }
}
