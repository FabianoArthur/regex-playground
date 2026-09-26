/** Source span of a node inside the pattern: `pattern.slice(start, end)`. */
export interface Span {
  start: number;
  end: number;
}

export type ClassEscapeKind = 'digit' | 'word' | 'space';

export interface Alternation extends Span {
  type: 'alternation';
  alternatives: Sequence[];
}

export interface Sequence extends Span {
  type: 'sequence';
  items: Term[];
}

export interface Literal extends Span {
  type: 'literal';
  /** The character matched, already unescaped (`\n` → newline, `\.` → `.`). */
  value: string;
  /** How it was written, when it was an escape (`\x41`, `\n`, `\.`). */
  escape?: string;
}

export interface AnyChar extends Span {
  type: 'any';
}

export interface Anchor extends Span {
  type: 'anchor';
  kind: 'start' | 'end' | 'wordBoundary' | 'notWordBoundary';
}

export interface ClassEscape extends Span {
  type: 'classEscape';
  kind: ClassEscapeKind;
  negated: boolean;
}

export interface UnicodeProperty extends Span {
  type: 'unicodeProperty';
  /** `Letter`, `Script=Greek`, … exactly as written between the braces. */
  property: string;
  negated: boolean;
}

export interface Range extends Span {
  type: 'range';
  from: Literal;
  to: Literal;
}

export type ClassMember = Literal | Range | ClassEscape | UnicodeProperty;

export interface CharClass extends Span {
  type: 'charClass';
  negated: boolean;
  members: ClassMember[];
}

export type GroupKind =
  | 'capturing'
  | 'nonCapturing'
  | 'lookahead'
  | 'negativeLookahead'
  | 'lookbehind'
  | 'negativeLookbehind';

export interface Group extends Span {
  type: 'group';
  kind: GroupKind;
  /** 1-based capture number, only for capturing groups. */
  index?: number;
  name?: string;
  body: Alternation | Sequence;
}

export interface Backreference extends Span {
  type: 'backreference';
  ref: number | string;
}

export interface Quantifier extends Span {
  type: 'quantifier';
  min: number;
  /** `Infinity` for an open upper bound. */
  max: number;
  lazy: boolean;
  /** How the quantifier itself was written: `*`, `+?`, `{2,5}`. */
  symbol: string;
  body: Atom;
}

export type Atom =
  | Literal
  | AnyChar
  | ClassEscape
  | UnicodeProperty
  | CharClass
  | Group
  | Backreference;

export type Term = Atom | Anchor | Quantifier;

export type Node = Alternation | Sequence | Term | ClassMember;

export interface ParsedRegex {
  pattern: string;
  root: Alternation | Sequence;
  groupCount: number;
}
