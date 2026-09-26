export interface LibraryPattern {
  id: string;
  name: string;
  description: string;
  pattern: string;
  flags: string;
  /** Text loaded into the tester when the pattern is picked. */
  sample: string;
  /** Whole strings the pattern must accept / reject — checked by the test suite. */
  shouldMatch: string[];
  shouldNotMatch: string[];
}

export const LIBRARY: LibraryPattern[] = [
  {
    id: 'iso-date',
    name: 'ISO date',
    description: 'A calendar date written as YYYY-MM-DD, with named groups for each part.',
    pattern: '(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])',
    flags: 'g',
    sample: 'Released on 2026-09-26, patched on 2026-10-03.\nNot a date: 2026-13-01 or 26-09-2026.',
    shouldMatch: ['2026-09-26', '1999-12-31', '2000-02-29'],
    shouldNotMatch: ['2026-13-01', '2026-00-10', '26-09-2026', '2026-9-26'],
  },
  {
    id: 'email',
    name: 'E-mail address',
    description: 'A pragmatic e-mail check — good for spotting addresses in text, not a full RFC 5322 validator.',
    pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)*\\.[A-Za-z]{2,}',
    flags: 'g',
    sample: 'Write to hello@example.com or first.last+tag@mail.example.org.\nBroken: user@localhost, @example.com',
    shouldMatch: ['hello@example.com', 'first.last+tag@mail.example.org', 'a_b@x-y.io'],
    shouldNotMatch: ['user@localhost', '@example.com', 'hello@', 'hello example.com'],
  },
  {
    id: 'url',
    name: 'Web URL',
    description: 'An http or https link, up to the first whitespace or closing bracket.',
    pattern: 'https?:\\/\\/[\\w-]+(?:\\.[\\w-]+)+(?::\\d{1,5})?(?:[/?#][^\\s)\\]]*)?',
    flags: 'gi',
    sample: 'Docs at https://developer.mozilla.org/en-US/docs/Web (see http://localhost.test:8080/?q=1).',
    shouldMatch: ['https://example.com', 'http://sub.example.co.uk:8080/path?q=1#top', 'HTTPS://EXAMPLE.COM'],
    shouldNotMatch: ['ftp://example.com', 'https://', 'example.com'],
  },
  {
    id: 'ipv4',
    name: 'IPv4 address',
    description: 'Four numbers from 0 to 255 separated by dots, rejecting 256 and above.',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b',
    flags: 'g',
    sample: 'Gateway 192.168.0.1, DNS 1.1.1.1, invalid 256.1.1.1 and 10.0.0.300.',
    shouldMatch: ['192.168.0.1', '0.0.0.0', '255.255.255.255'],
    shouldNotMatch: ['256.1.1.1', '10.0.0', '1.2.3.04'],
  },
  {
    id: 'hex-color',
    name: 'Hex colour',
    description: 'CSS hex colours: #rgb, #rgba, #rrggbb or #rrggbbaa.',
    pattern: '#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b',
    flags: 'g',
    sample: 'color: #1a2b3c; background: #FFF; border-color: #12345; shadow: #00000080;',
    shouldMatch: ['#fff', '#FFFA', '#1a2b3c', '#00000080'],
    shouldNotMatch: ['#12345', '#ggg', 'fff'],
  },
  {
    id: 'uuid',
    name: 'UUID',
    description: 'A UUID in its canonical 8-4-4-4-12 form, any version.',
    pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',
    flags: 'gi',
    sample: 'request 3f2504e0-4f89-41d3-9a0c-0305e82c3301 failed; retry 0192f0c1-2b3a-7c4d-8e5f-6a7b8c9d0e1f',
    shouldMatch: ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', '0192F0C1-2B3A-7C4D-8E5F-6A7B8C9D0E1F'],
    shouldNotMatch: ['3f2504e0-4f89-01d3-9a0c-0305e82c3301', '3f2504e04f8941d39a0c0305e82c3301'],
  },
  {
    id: 'semver',
    name: 'Semantic version',
    description: 'MAJOR.MINOR.PATCH with an optional pre-release tag, as in semver.org.',
    pattern:
      '(?<major>0|[1-9]\\d*)\\.(?<minor>0|[1-9]\\d*)\\.(?<patch>0|[1-9]\\d*)(?:-(?<pre>[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?',
    flags: 'g',
    sample: 'Upgrade from 1.9.0 to 2.0.0-rc.1 (not 01.2.3).',
    shouldMatch: ['1.0.0', '10.20.30', '2.0.0-rc.1', '1.0.0-alpha-beta'],
    shouldNotMatch: ['1.0', '01.2.3', '1.2.3-'],
  },
  {
    id: 'time-24h',
    name: '24-hour time',
    description: 'HH:MM with optional :SS, from 00:00 to 23:59:59.',
    pattern: '\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b',
    flags: 'g',
    sample: 'Stand-up at 09:30, deploy at 17:05:30, never at 24:00 or 9:60.',
    shouldMatch: ['00:00', '09:30', '23:59:59'],
    shouldNotMatch: ['24:00', '9:30', '12:60'],
  },
  {
    id: 'slug',
    name: 'URL slug',
    description: 'Lowercase words joined by single hyphens, as used in clean URLs.',
    pattern: '[a-z0-9]+(?:-[a-z0-9]+)*',
    flags: '',
    sample: 'regex-playground',
    shouldMatch: ['regex-playground', 'post-2026', 'a'],
    shouldNotMatch: ['Regex-Playground', 'double--hyphen', '-leading', 'trailing-'],
  },
  {
    id: 'number',
    name: 'Number',
    description: 'An integer or decimal, optionally signed, with an optional exponent.',
    pattern: '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?',
    flags: 'g',
    sample: 'Totals: 42, -3.14, +0.5, .75 and 6.02e23.',
    shouldMatch: ['42', '-3.14', '+0.5', '.75', '6.02e23', '1E-9'],
    shouldNotMatch: ['.', '1e', 'abc', '--1'],
  },
  {
    id: 'duplicate-word',
    name: 'Repeated word',
    description: 'A word typed twice in a row — uses a backreference to the first capture.',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    flags: 'gi',
    sample: 'This is is a test of the the backreference. Not a match: the theory.',
    shouldMatch: ['is is', 'the  the', 'The the'],
    shouldNotMatch: ['the theory', 'is it'],
  },
  {
    id: 'price',
    name: 'Price after a currency sign',
    description: 'Digits preceded by $ or €, using a lookbehind so the sign is not part of the match.',
    pattern: '(?<=[$€])\\d+(?:[.,]\\d{2})?',
    flags: 'g',
    sample: 'Was $120.00, now €99,90 — the 15 in "15 items" is not a price.',
    shouldMatch: [],
    shouldNotMatch: ['15', '$'],
  },
];
