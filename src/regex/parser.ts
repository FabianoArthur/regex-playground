import type {
  Alternation,
  Atom,
  Backreference,
  CharClass,
  ClassEscape,
  ClassMember,
  Group,
  GroupKind,
  Literal,
  ParsedRegex,
  Sequence,
  Term,
  UnicodeProperty,
} from './ast';

/** A syntax error, with the index in the pattern where it was detected. */
export class RegexSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = 'RegexSyntaxError';
  }
}

const SYNTAX_CHARS = new Set('^$\\.*+?()[]{}|/');
const GROUP_NAME = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;
const BRACE_QUANTIFIER = /^\{(\d+)(?:(,)(\d*))?\}/;
const CONTROL_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v' };

/**
 * Parses an ECMAScript regular expression into an AST with source spans.
 *
 * It follows the engine's own rules: stricter in unicode mode (`u`/`v`), and in the default mode it
 * accepts the legacy web-compatibility syntax (a lone `{` or `]` is a literal, `\8` is an identity
 * escape, `\101` is an octal escape…). `v`-mode class set notation (`&&`, `--`, nested classes,
 * `\q{…}`) is not supported: it is reported as a `RegexSyntaxError` even though the engine accepts it,
 * so callers can say "valid, but not explained" instead of explaining it wrongly.
 */
export function parse(pattern: string, flags = ''): ParsedRegex {
  return new Parser(pattern, flags.includes('u') || flags.includes('v'), flags.includes('v')).parse();
}

class Parser {
  private pos = 0;
  private groupCount = 0;
  private readonly names = new Set<string>();
  private readonly namedRefs: Array<{ name: string; position: number }> = [];
  private readonly totalGroups: number;
  private readonly hasNamedGroups: boolean;

  constructor(
    private readonly src: string,
    private readonly unicode: boolean,
    private readonly unicodeSets = false,
  ) {
    const scan = prescanGroups(src);
    this.totalGroups = scan.count;
    this.hasNamedGroups = scan.named;
  }

  parse(): ParsedRegex {
    const root = this.disjunction();
    if (this.pos < this.src.length) {
      // The only way to stop early at the top level is an unmatched ')'.
      this.fail("Unmatched ')'", this.pos);
    }
    for (const ref of this.namedRefs) {
      if (!this.names.has(ref.name)) this.fail(`Unknown group name '${ref.name}'`, ref.position);
    }
    return { pattern: this.src, root, groupCount: this.groupCount };
  }

  private fail(message: string, position = this.pos): never {
    throw new RegexSyntaxError(message, position);
  }

  private peek(offset = 0): string | undefined {
    return this.src[this.pos + offset];
  }

  private eat(ch: string): boolean {
    if (this.src[this.pos] !== ch) return false;
    this.pos++;
    return true;
  }

  private rest(): string {
    return this.src.slice(this.pos);
  }

  private disjunction(): Alternation | Sequence {
    const start = this.pos;
    const alternatives = [this.sequence()];
    while (this.eat('|')) alternatives.push(this.sequence());
    if (alternatives.length === 1) return alternatives[0] as Sequence;
    return { type: 'alternation', alternatives, start, end: this.pos };
  }

  private sequence(): Sequence {
    const start = this.pos;
    const items: Term[] = [];
    while (this.pos < this.src.length && this.peek() !== '|' && this.peek() !== ')') {
      items.push(this.term());
    }
    return { type: 'sequence', items, start, end: this.pos };
  }

  private term(): Term {
    const start = this.pos;
    const ch = this.peek();
    if (ch === '^' || ch === '$') {
      this.pos++;
      const anchor = { type: 'anchor', kind: ch === '^' ? 'start' : 'end', start, end: this.pos } as const;
      this.rejectQuantifier();
      return anchor;
    }
    if (ch === '\\' && (this.peek(1) === 'b' || this.peek(1) === 'B')) {
      this.pos += 2;
      const kind = this.src[start + 1] === 'b' ? 'wordBoundary' : 'notWordBoundary';
      this.rejectQuantifier();
      return { type: 'anchor', kind, start, end: this.pos };
    }
    if (this.isQuantifierStart()) this.fail('Nothing to repeat');

    const atom = this.atom();
    const quantified = this.quantifier(atom);
    if (!quantified) return atom;
    if (atom.type === 'group' && (atom.kind === 'lookbehind' || atom.kind === 'negativeLookbehind')) {
      this.fail('Invalid quantifier: a lookbehind cannot be repeated', quantified.start);
    }
    if (this.unicode && atom.type === 'group' && atom.kind.includes('ookahead')) {
      this.fail('Invalid quantifier: a lookahead cannot be repeated in unicode mode', quantified.start);
    }
    if (this.isQuantifierStart()) this.fail('Nothing to repeat');
    return quantified;
  }

  private rejectQuantifier(): void {
    if (this.isQuantifierStart()) this.fail('Nothing to repeat');
  }

  /** True at `*`, `+`, `?` or at a `{` that really starts a `{n,m}` quantifier. */
  private isQuantifierStart(): boolean {
    const ch = this.peek();
    if (ch === '*' || ch === '+' || ch === '?') return true;
    if (ch !== '{') return false;
    if (BRACE_QUANTIFIER.test(this.rest())) return true;
    if (this.unicode) this.fail('Incomplete quantifier');
    return false;
  }

  private quantifier(body: Atom) {
    const start = this.pos;
    const ch = this.peek();
    let min: number;
    let max: number;
    if (ch === '*' || ch === '+' || ch === '?') {
      this.pos++;
      [min, max] = ch === '*' ? [0, Infinity] : ch === '+' ? [1, Infinity] : [0, 1];
    } else {
      const m = ch === '{' ? BRACE_QUANTIFIER.exec(this.rest()) : null;
      if (!m) {
        if (ch === '{' && this.unicode) this.fail('Incomplete quantifier');
        return null;
      }
      min = Number(m[1]);
      max = m[2] ? (m[3] ? Number(m[3]) : Infinity) : min;
      if (max < min) this.fail('Numbers out of order in {} quantifier');
      this.pos += m[0].length;
    }
    const lazy = this.eat('?');
    return {
      type: 'quantifier',
      min,
      max,
      lazy,
      symbol: this.src.slice(start, this.pos),
      body,
      start: body.start,
      end: this.pos,
    } as const;
  }

  private atom(): Atom {
    const start = this.pos;
    const ch = this.peek() as string;
    switch (ch) {
      case '.':
        this.pos++;
        return { type: 'any', start, end: this.pos };
      case '(':
        return this.group();
      case '[':
        return this.charClass();
      case '\\':
        return this.atomEscape();
      case ')':
        return this.fail("Unmatched ')'");
      case ']':
      case '}':
        if (this.unicode) this.fail(`Lone quantifier brackets: '${ch}' must be escaped in unicode mode`);
        break;
      case '{':
        // Only reached when `{` is not a valid quantifier (non-unicode mode).
        break;
    }
    const value = this.readChar();
    return { type: 'literal', value, start, end: this.pos };
  }

  /** Reads one character: a full code point in unicode mode, a UTF-16 code unit otherwise. */
  private readChar(): string {
    const value = this.unicode ? String.fromCodePoint(this.src.codePointAt(this.pos) as number) : (this.peek() as string);
    this.pos += value.length;
    return value;
  }

  private group(): Group {
    const start = this.pos;
    this.pos++; // (
    let kind: GroupKind = 'capturing';
    let name: string | undefined;
    if (this.eat('?')) {
      if (this.eat(':')) kind = 'nonCapturing';
      else if (this.eat('=')) kind = 'lookahead';
      else if (this.eat('!')) kind = 'negativeLookahead';
      else if (this.rest().startsWith('<=')) {
        this.pos += 2;
        kind = 'lookbehind';
      } else if (this.rest().startsWith('<!')) {
        this.pos += 2;
        kind = 'negativeLookbehind';
      } else if (this.eat('<')) {
        name = this.groupName(start);
      } else {
        this.fail('Invalid group', start);
      }
    }
    const index = kind === 'capturing' ? ++this.groupCount : undefined;
    const body = this.disjunction();
    if (!this.eat(')')) this.fail('Unterminated group', start);
    const group: Group = { type: 'group', kind, body, start, end: this.pos };
    if (index !== undefined) group.index = index;
    if (name !== undefined) group.name = name;
    return group;
  }

  /** Reads `name>` after `(?<` or `\k<`. */
  private groupName(errorAt: number): string {
    const close = this.src.indexOf('>', this.pos);
    if (close === -1) this.fail('Invalid group name', errorAt);
    const name = this.src.slice(this.pos, close);
    if (!GROUP_NAME.test(name)) this.fail('Invalid group name', errorAt);
    if (this.src[errorAt + 1] === '?') {
      // Declaration, not a \k reference.
      if (this.names.has(name)) this.fail(`Duplicate group name '${name}'`, errorAt);
      this.names.add(name);
    }
    this.pos = close + 1;
    return name;
  }

  private atomEscape(): Atom {
    const start = this.pos;
    this.pos++; // backslash
    const ch = this.peek();
    if (ch === undefined) this.fail('\\ at end of pattern', start);

    const shared = this.sharedEscape(start);
    if (shared) return shared;

    if (ch >= '1' && ch <= '9') {
      const digits = /^\d+/.exec(this.rest())?.[0] as string;
      const ref = Number(digits);
      if (ref <= this.totalGroups) {
        this.pos += digits.length;
        return { type: 'backreference', ref, start, end: this.pos } satisfies Backreference;
      }
      if (this.unicode) this.fail('Invalid escape', start);
      return this.legacyOctalOrIdentity(start);
    }
    if (ch === 'k' && (this.unicode || this.hasNamedGroups)) {
      this.pos++;
      if (!this.eat('<')) this.fail('Invalid named reference', start);
      const name = this.groupName(start);
      this.namedRefs.push({ name, position: start });
      return { type: 'backreference', ref: name, start, end: this.pos };
    }
    return this.identityEscape(start);
  }

  /** Escapes that mean the same thing inside and outside a character class. */
  private sharedEscape(start: number): ClassEscape | UnicodeProperty | Literal | null {
    const ch = this.peek() as string;
    const lower = ch.toLowerCase();
    if (lower === 'd' || lower === 'w' || lower === 's') {
      this.pos++;
      const kind = lower === 'd' ? 'digit' : lower === 'w' ? 'word' : 'space';
      return { type: 'classEscape', kind, negated: ch !== lower, start, end: this.pos };
    }
    if ((ch === 'p' || ch === 'P') && this.unicode) {
      this.pos++;
      const m = /^\{([A-Za-z_]+(?:=[A-Za-z0-9_]+)?)\}/.exec(this.rest());
      if (!m) this.fail('Invalid property name', start);
      this.pos += m[0].length;
      return { type: 'unicodeProperty', property: m[1] as string, negated: ch === 'P', start, end: this.pos };
    }
    if (ch in CONTROL_ESCAPES) {
      this.pos++;
      return this.escapedLiteral(CONTROL_ESCAPES[ch] as string, start);
    }
    if (ch === '0' && !/\d/.test(this.peek(1) ?? '')) {
      this.pos++;
      return this.escapedLiteral('\0', start);
    }
    if (ch === 'c' && /[A-Za-z]/.test(this.peek(1) ?? '')) {
      const letter = this.peek(1) as string;
      this.pos += 2;
      return this.escapedLiteral(String.fromCharCode(letter.charCodeAt(0) % 32), start);
    }
    if (ch === 'x') {
      const m = /^x([0-9a-fA-F]{2})/.exec(this.rest());
      if (m) {
        this.pos += 3;
        return this.escapedLiteral(String.fromCharCode(parseInt(m[1] as string, 16)), start);
      }
      if (this.unicode) this.fail('Invalid escape', start);
    }
    if (ch === 'u') {
      const code = this.unicodeEscapeValue();
      if (code !== null) return this.escapedLiteral(String.fromCodePoint(code), start);
      if (this.unicode) this.fail('Invalid Unicode escape', start);
    }
    return null;
  }

  /** At a `u` after the backslash: consumes `uHHHH`, a surrogate pair, or `u{H…}` (unicode mode). */
  private unicodeEscapeValue(): number | null {
    const braced = this.unicode ? /^u\{([0-9a-fA-F]+)\}/.exec(this.rest()) : null;
    if (braced) {
      const code = parseInt(braced[1] as string, 16);
      if (code > 0x10ffff) this.fail('Invalid Unicode escape');
      this.pos += braced[0].length;
      return code;
    }
    const m = /^u([0-9a-fA-F]{4})/.exec(this.rest());
    if (!m) return null;
    this.pos += 5;
    const high = parseInt(m[1] as string, 16);
    const low = this.unicode && high >= 0xd800 && high <= 0xdbff ? /^\\u(d[c-f][0-9a-f]{2})/i.exec(this.rest()) : null;
    if (!low) return high;
    this.pos += 6;
    return (high - 0xd800) * 0x400 + (parseInt(low[1] as string, 16) - 0xdc00) + 0x10000;
  }

  private legacyOctalOrIdentity(start: number): Literal {
    const octal = /^[0-3][0-7]{0,2}|^[4-7][0-7]?/.exec(this.rest());
    if (octal) {
      this.pos += octal[0].length;
      return this.escapedLiteral(String.fromCharCode(parseInt(octal[0], 8)), start);
    }
    return this.identityEscape(start);
  }

  private identityEscape(start: number): Literal {
    const ch = this.peek() as string;
    if (this.unicode && !SYNTAX_CHARS.has(ch)) this.fail('Invalid escape', start);
    // `\c` not followed by a letter is a literal backslash in legacy mode.
    if (ch === 'c') return this.escapedLiteral('\\', start);
    return this.escapedLiteral(this.readChar(), start);
  }

  private escapedLiteral(value: string, start: number): Literal {
    return { type: 'literal', value, escape: this.src.slice(start, this.pos), start, end: this.pos };
  }

  private charClass(): CharClass {
    const start = this.pos;
    this.pos++; // [
    const negated = this.eat('^');
    const members: ClassMember[] = [];
    while (this.peek() !== ']') {
      if (this.pos >= this.src.length) this.fail('Unterminated character class', start);
      this.rejectSetNotation();
      const from = this.classAtom();
      this.rejectSetNotation();
      if (this.peek() === '-' && this.peek(1) !== ']' && this.peek(1) !== undefined) {
        const dash = this.pos;
        this.pos++;
        const to = this.classAtom();
        if (from.type === 'literal' && to.type === 'literal') {
          if ((from.value.codePointAt(0) as number) > (to.value.codePointAt(0) as number)) {
            this.fail('Range out of order in character class', from.start);
          }
          members.push({ type: 'range', from, to, start: from.start, end: to.end });
          continue;
        }
        if (this.unicode) this.fail('Invalid character class', from.start);
        members.push(from, { type: 'literal', value: '-', start: dash, end: dash + 1 }, to);
        continue;
      }
      members.push(from);
    }
    this.pos++; // ]
    return { type: 'charClass', negated, members, start, end: this.pos };
  }

  private rejectSetNotation(): void {
    if (!this.unicodeSets) return;
    const rest = this.rest();
    if (rest.startsWith('&&') || rest.startsWith('--') || rest.startsWith('[') || rest.startsWith('\\q')) {
      this.fail('Class set notation (v flag) is not supported by the explainer');
    }
  }

  private classAtom(): Literal | ClassEscape | UnicodeProperty {
    const start = this.pos;
    if (this.peek() !== '\\') return { type: 'literal', value: this.readChar(), start, end: this.pos };
    this.pos++;
    const ch = this.peek();
    if (ch === undefined) this.fail('\\ at end of pattern', start);
    const shared = this.sharedEscape(start);
    if (shared) return shared;
    if (ch === 'c' && !this.unicode && /[0-9_]/.test(this.peek(1) ?? '')) {
      // Annex B: inside a class, \c also takes a digit or underscore.
      const code = (this.peek(1) as string).charCodeAt(0) % 32;
      this.pos += 2;
      return this.escapedLiteral(String.fromCharCode(code), start);
    }
    if (ch === 'b') {
      this.pos++;
      return this.escapedLiteral('\b', start);
    }
    if (ch === '-' && this.unicode) {
      this.pos++;
      return this.escapedLiteral('-', start);
    }
    if (/\d/.test(ch)) {
      if (this.unicode) this.fail('Invalid class escape', start);
      return this.legacyOctalOrIdentity(start);
    }
    return this.identityEscape(start);
  }
}

/**
 * Names of the capturing groups, in order (`undefined` for unnamed ones). A cheap scan that does
 * not validate the pattern, so it also works for syntax the parser does not explain (`v` mode).
 */
export function captureNames(src: string): Array<string | undefined> {
  return prescanGroups(src).names;
}

/** Counts capturing groups ahead of parsing, so `\2` can be told apart from an octal escape. */
function prescanGroups(src: string): { count: number; named: boolean; names: Array<string | undefined> } {
  let count = 0;
  let named = false;
  let inClass = false;
  const names: Array<string | undefined> = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') i++;
    else if (inClass) inClass = ch !== ']';
    else if (ch === '[') inClass = true;
    else if (ch === '(') {
      if (src[i + 1] !== '?') {
        count++;
        names.push(undefined);
      } else if (src[i + 2] === '<' && src[i + 3] !== '=' && src[i + 3] !== '!') {
        count++;
        named = true;
        const close = src.indexOf('>', i + 3);
        names.push(close === -1 ? undefined : src.slice(i + 3, close));
      }
    }
  }
  return { count, named, names };
}
