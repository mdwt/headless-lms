const NON_PUBLIC_IPV4: ReadonlyArray<readonly [number, number]> = [
  [ipv4Number([0, 0, 0, 0]), 8],
  [ipv4Number([10, 0, 0, 0]), 8],
  [ipv4Number([100, 64, 0, 0]), 10],
  [ipv4Number([127, 0, 0, 0]), 8],
  [ipv4Number([169, 254, 0, 0]), 16],
  [ipv4Number([172, 16, 0, 0]), 12],
  [ipv4Number([192, 0, 0, 0]), 24],
  [ipv4Number([192, 0, 2, 0]), 24],
  [ipv4Number([192, 88, 99, 0]), 24],
  [ipv4Number([192, 168, 0, 0]), 16],
  [ipv4Number([198, 18, 0, 0]), 15],
  [ipv4Number([198, 51, 100, 0]), 24],
  [ipv4Number([203, 0, 113, 0]), 24],
  [ipv4Number([224, 0, 0, 0]), 4],
  [ipv4Number([240, 0, 0, 0]), 4],
];

function ipv4Number(octets: number[]): number {
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function parseHextets(part: string): number[] | null {
  if (part === '') {
    return [];
  }
  const groups = part.split(':');
  const hextets: number[] = [];
  for (const [i, group] of groups.entries()) {
    if (i === groups.length - 1 && group.includes('.')) {
      const octets = parseIpv4(group);
      if (!octets) {
        return null;
      }
      hextets.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
    } else if (/^[0-9a-f]{1,4}$/i.test(group)) {
      hextets.push(parseInt(group, 16));
    } else {
      return null;
    }
  }
  return hextets;
}

function parseIpv6(value: string): number[] | null {
  const address = value.split('%')[0]!;
  const halves = address.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = parseHextets(halves[0]!);
  const tail = halves.length === 2 ? parseHextets(halves[1]!) : [];
  if (!head || !tail) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) {
    return null;
  }
  const hextets = [...head, ...new Array<number>(missing).fill(0), ...tail];
  return hextets.flatMap((hextet) => [hextet >> 8, hextet & 0xff]);
}

function isPublicIpv4(octets: number[]): boolean {
  const address = ipv4Number(octets);
  return NON_PUBLIC_IPV4.every(([network, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (address & mask) >>> 0 !== network;
  });
}

function startsWith(bytes: number[], prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

function isPublicIpv6(bytes: number[]): boolean {
  if (bytes.slice(0, 10).every((b) => b === 0)) {
    const mapped = bytes[10] === 0xff && bytes[11] === 0xff;
    const compatible = bytes[10] === 0 && bytes[11] === 0;
    return (mapped || compatible) && isPublicIpv4(bytes.slice(12));
  }
  if (startsWith(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0])) {
    return isPublicIpv4(bytes.slice(12));
  }
  if (startsWith(bytes, [0x20, 0x02])) {
    return isPublicIpv4(bytes.slice(2, 6));
  }
  const [first = 0, second = 0] = bytes;
  return !(
    (first & 0xfe) === 0xfc ||
    (first === 0xfe && (second & 0x80) === 0x80) ||
    first === 0xff ||
    startsWith(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01]) ||
    startsWith(bytes, [0x01, 0x00, 0, 0, 0, 0, 0, 0]) ||
    startsWith(bytes, [0x20, 0x01, 0x0d, 0xb8]) ||
    startsWith(bytes, [0x20, 0x01, 0x00, 0x00])
  );
}

/** True when `address` is an IP literal; brackets and an IPv6 zone are allowed. */
export function isIpLiteral(address: string): boolean {
  const bare = address.replace(/^\[(.*)\]$/, '$1');
  return parseIpv4(bare) !== null || parseIpv6(bare) !== null;
}

/** True only for an IP literal routable on the public internet; anything unparseable is not public. */
export function isPublicIp(address: string): boolean {
  const bare = address.replace(/^\[(.*)\]$/, '$1');
  const v4 = parseIpv4(bare);
  if (v4) {
    return isPublicIpv4(v4);
  }
  const v6 = parseIpv6(bare);
  return v6 !== null && isPublicIpv6(v6);
}

/** False for localhost names and for IP literals outside the public internet. */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }
  return isIpLiteral(host) ? isPublicIp(host) : true;
}
