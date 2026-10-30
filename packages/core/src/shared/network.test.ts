import { describe, expect, it } from 'vitest';
import { isIpLiteral, isPublicHostname, isPublicIp } from './network.js';

describe('isPublicIp', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1',
    '100.100.100.200',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.170',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '239.255.255.250',
    '255.255.255.255',
    '::',
    '::1',
    '[::1]',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    '64:ff9b::10.0.0.1',
    '2002:c0a8:0101::1',
    'fc00::1',
    'fd00:ec2::254',
    'fe80::1',
    'fe80::1%eth0',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
  ])('refuses %s', (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.255.255',
    '172.32.0.1',
    '192.169.0.1',
    '169.255.0.1',
    '2606:4700:4700::1111',
    '2a00:1450:4001:80b::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::8.8.8.8',
  ])('allows %s', (address) => {
    expect(isPublicIp(address)).toBe(true);
  });

  it.each(['example.com', '', '1.2.3', '256.1.1.1', '1::2::3', 'gggg::1', '1:2:3:4:5:6:7:8:9'])(
    'treats %s as not an IP and so not public',
    (value) => {
      expect(isIpLiteral(value)).toBe(false);
      expect(isPublicIp(value)).toBe(false);
    },
  );
});

describe('isPublicHostname', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'api.localhost',
    '127.0.0.1',
    '[::1]',
    '10.1.2.3',
  ])('refuses %s', (host) => {
    expect(isPublicHostname(host)).toBe(false);
  });

  it.each(['example.com', 'hooks.example.com', '8.8.8.8', '[2606:4700:4700::1111]'])(
    'allows %s',
    (host) => {
      expect(isPublicHostname(host)).toBe(true);
    },
  );
});
