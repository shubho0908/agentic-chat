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
  '::1',
  'fc',
  'fd',
  'fe80',
  '::ffff:127.',
] as const;

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((value, octet) => (value << 8) + Number(octet), 0);
}

function isIpv4InRange(ip: string, range: readonly [string, number]): boolean {
  const [baseIp, prefixLength] = range;
  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(baseIp) & mask);
}

export function isPrivateAddress(address: string): boolean {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) {
    return BLOCKED_IPV4_CIDRS.some((range) => isIpv4InRange(address, range));
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    return BLOCKED_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  return false;
}

export async function assertSafePublicUrl(
  input: string | URL,
  options?: {
    allowHosts?: string[];
  }
): Promise<URL> {
  const url = typeof input === 'string' ? new URL(input) : input;

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are allowed');
  }

  if (url.username || url.password) {
    throw new Error('Authenticated URLs are not allowed');
  }

  const hostname = url.hostname.toLowerCase();
  const allowHosts = new Set((options?.allowHosts ?? []).map((host) => host.toLowerCase()));

  if ((BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.internal')) && !allowHosts.has(hostname)) {
    throw new Error('Requests to local or metadata hosts are not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname) && !allowHosts.has(hostname)) {
      throw new Error('Requests to private network addresses are not allowed');
    }
    return url;
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

  return url;
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
      .map((host) => host.trim())
      .filter(Boolean);

    return [...trustedOrigins, ...extraHosts].some((pattern) =>
      matchesHostPattern(hostname, pattern)
    );
  } catch {
    return false;
  }
}
