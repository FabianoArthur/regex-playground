import './style.css';
import { segment } from './highlight';
import { LIBRARY, type LibraryPattern } from './library';
import { explain, explainFlags, type Explanation } from './regex/explain';
import type { Match, MatchResult } from './regex/match';
import { parse, RegexSyntaxError } from './regex/parser';
import { decodeState, encodeState, type PlaygroundState } from './share';
import { byId, debounce, h } from './ui/dom';
import { MATCH_TIMEOUT_MS, MatchRunner } from './worker/client';

const FLAG_ORDER = ['g', 'i', 'm', 's', 'u', 'v', 'y', 'd'] as const;
const MAX_LISTED_MATCHES = 200;

const patternInput = byId<HTMLInputElement>('pattern');
const patternBackdrop = byId<HTMLDivElement>('pattern-backdrop');
const patternStatus = byId<HTMLParagraphElement>('pattern-status');
const flagsText = byId<HTMLSpanElement>('flags-text');
const flagsBox = byId<HTMLDivElement>('flags');
const textInput = byId<HTMLTextAreaElement>('text');
const textBackdrop = byId<HTMLDivElement>('text-backdrop');
const matchCount = byId<HTMLSpanElement>('match-count');
const matchList = byId<HTMLOListElement>('matches');
const explanationBox = byId<HTMLDivElement>('explanation');
const flagNotes = byId<HTMLUListElement>('flag-notes');
const libraryList = byId<HTMLUListElement>('library');
const shareButton = byId<HTMLButtonElement>('share');

const runner = new MatchRunner();
const firstExample = LIBRARY[0] as LibraryPattern;
let state: PlaygroundState = decodeState(location.hash) ?? {
  pattern: firstExample.pattern,
  flags: firstExample.flags,
  text: firstExample.sample,
};
let patternError: { message: string; position: number } | null = null;
let lastMatches: Match[] = [];

// ---------- pattern + explanation ----------

function renderPattern(highlight: { start: number; end: number } | null = null): void {
  const { pattern } = state;
  const marks: Array<{ start: number; end: number; cls: string }> = [];
  if (highlight) marks.push({ ...highlight, cls: 'span-hl' });
  else if (patternError) {
    const at = Math.min(patternError.position, pattern.length);
    marks.push({ start: at, end: Math.min(at + 1, pattern.length), cls: 'span-err' });
  }
  const nodes: Node[] = [];
  let pos = 0;
  for (const mark of marks) {
    nodes.push(document.createTextNode(pattern.slice(pos, mark.start)));
    nodes.push(h('mark', { class: mark.cls }, pattern.slice(mark.start, mark.end) || ' '));
    pos = mark.end;
  }
  nodes.push(document.createTextNode(pattern.slice(pos) + ' '));
  patternBackdrop.replaceChildren(...nodes);
  patternBackdrop.scrollLeft = patternInput.scrollLeft;
}

function explanationTree(nodes: Explanation[]): HTMLUListElement {
  return h(
    'ul',
    {},
    ...nodes.map((node) => {
      const source = state.pattern.slice(node.span.start, node.span.end);
      const row = h(
        'div',
        { class: `row kind-${node.kind}`, tabindex: '0', 'data-start': String(node.span.start), 'data-end': String(node.span.end) },
        h('code', { class: 'src' }, source || '∅'),
        h('span', { class: 'what' }, node.label, node.detail ? h('span', { class: 'detail' }, node.detail) : null),
      );
      return h('li', {}, row, node.children.length ? explanationTree(node.children) : null);
    }),
  );
}

function renderExplanation(): void {
  const { pattern, flags } = state;
  patternError = null;
  let nativeError: string | null = null;
  try {
    new RegExp(pattern, flags);
  } catch (error) {
    nativeError = error instanceof Error ? error.message : String(error);
  }

  let tree: Explanation[] | null = null;
  try {
    tree = explain(parse(pattern, flags), flags);
  } catch (error) {
    if (!(error instanceof RegexSyntaxError)) throw error;
    patternError = { message: error.message, position: error.position };
  }

  if (nativeError) {
    const where = patternError ? ` (at position ${patternError.position + 1})` : '';
    setStatus(`${patternError?.message ?? nativeError}${where}`, 'error');
    explanationBox.replaceChildren(h('p', { class: 'empty' }, 'Fix the pattern to see its explanation.'));
  } else if (!tree) {
    // Valid for the engine, but beyond what the explainer understands (e.g. v-mode set operations).
    patternError = null;
    setStatus('Valid pattern.', 'ok');
    explanationBox.replaceChildren(h('p', { class: 'empty' }, 'This pattern is valid, but it uses syntax the explainer does not cover yet.'));
  } else {
    setStatus(pattern ? 'Valid pattern.' : 'Empty pattern — it matches the empty string everywhere.', 'ok');
    explanationBox.replaceChildren(tree.length ? explanationTree(tree) : h('p', { class: 'empty' }, 'Type a pattern above.'));
  }

  flagNotes.replaceChildren(
    ...explainFlags(flags).map((f) => h('li', {}, h('code', {}, f.flag), h('strong', {}, f.name), ` — ${f.description}`)),
  );
  renderPattern();
}

function setStatus(message: string, tone: 'ok' | 'error'): void {
  patternStatus.textContent = message;
  patternStatus.dataset.tone = tone;
  patternInput.setAttribute('aria-invalid', String(tone === 'error'));
}

function onExplanationFocus(event: Event): void {
  const row = (event.target as HTMLElement).closest<HTMLElement>('.row');
  if (!row) return;
  renderPattern({ start: Number(row.dataset.start), end: Number(row.dataset.end) });
}

explanationBox.addEventListener('mouseover', onExplanationFocus);
explanationBox.addEventListener('focusin', onExplanationFocus);
explanationBox.addEventListener('mouseleave', () => renderPattern());
explanationBox.addEventListener('focusout', () => renderPattern());

// ---------- flags ----------

function renderFlags(): void {
  flagsText.textContent = state.flags;
  flagsBox.replaceChildren(
    ...FLAG_ORDER.map((flag) => {
      const info = explainFlags(flag)[0];
      const on = state.flags.includes(flag);
      const button = h(
        'button',
        { type: 'button', class: 'flag', 'aria-pressed': String(on), title: info?.description ?? '', 'data-flag': flag },
        h('code', {}, flag),
        h('span', {}, info?.name ?? flag),
      );
      return button;
    }),
  );
}

flagsBox.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-flag]');
  if (!button) return;
  const flag = button.dataset.flag as string;
  let flags = state.flags.includes(flag) ? state.flags.replace(flag, '') : state.flags + flag;
  // u and v cannot be combined.
  if (flag === 'u') flags = flags.replace('v', '');
  if (flag === 'v') flags = flags.replace('u', '');
  state = { ...state, flags: FLAG_ORDER.filter((f) => flags.includes(f)).join('') };
  renderFlags();
  flagsBox.querySelector<HTMLButtonElement>(`button[data-flag="${flag}"]`)?.focus();
  refresh();
});

// ---------- matching ----------

function renderText(matches: Match[]): void {
  const nodes: Node[] = segment(state.text, matches).map((seg) => {
    if (seg.match === null) return document.createTextNode(seg.text);
    if (!seg.text) return h('span', { class: 'caret' });
    return h('mark', { class: seg.match % 2 ? 'm1' : 'm0' }, seg.text);
  });
  // A trailing newline in a textarea adds a line; keep the backdrop the same height.
  nodes.push(document.createTextNode('\n'));
  textBackdrop.replaceChildren(...nodes);
  syncTextScroll();
}

function renderMatches(result: MatchResult | null, note?: string): void {
  if (!result) {
    matchList.replaceChildren(h('li', { class: 'empty' }, note ?? ''));
    return;
  }
  const { matches, truncated } = result;
  const items = matches.slice(0, MAX_LISTED_MATCHES).map((m) =>
    h(
      'li',
      { class: 'match' },
      h(
        'div',
        { class: 'match-head' },
        h('span', { class: 'match-no' }, `#${m.index + 1}`),
        h('code', { class: `match-text ${m.index % 2 ? 'm1' : 'm0'}` }, visible(m.text)),
        h('span', { class: 'match-pos' }, `${m.start}–${m.end}`),
      ),
      m.groups.length
        ? h(
            'dl',
            { class: 'groups' },
            ...m.groups.flatMap((g) => [
              h('dt', {}, g.name ? `${g.index} · ${g.name}` : String(g.index)),
              h('dd', {}, g.text === undefined ? h('em', {}, 'did not participate') : h('code', {}, visible(g.text))),
            ]),
          )
        : null,
    ),
  );
  if (!items.length) items.push(h('li', { class: 'empty' }, 'No match.'));
  if (matches.length > MAX_LISTED_MATCHES || truncated) {
    items.push(h('li', { class: 'empty' }, `Showing the first ${Math.min(matches.length, MAX_LISTED_MATCHES)} matches.`));
  }
  matchList.replaceChildren(...items);
}

/** Makes empty and whitespace-only matches visible in the list. */
function visible(text: string): string {
  if (!text) return '(empty)';
  return text.replace(/\n/g, '↵').replace(/\t/g, '→');
}

const runMatches = debounce(async () => {
  const { pattern, flags, text } = state;
  try {
    new RegExp(pattern, flags);
  } catch {
    lastMatches = [];
    renderText([]);
    matchCount.textContent = '';
    renderMatches(null, 'Fix the pattern to see matches.');
    return;
  }
  const outcome = await runner.run(pattern, flags, text);
  if (outcome.status === 'stale') return;
  if (outcome.status === 'timeout') {
    lastMatches = [];
    renderText([]);
    matchCount.textContent = 'Timed out';
    renderMatches(
      null,
      `Matching took longer than ${MATCH_TIMEOUT_MS / 1000} s and was stopped. The pattern probably backtracks catastrophically — look for nested quantifiers such as (a+)+.`,
    );
    return;
  }
  if (outcome.status === 'error') {
    renderMatches(null, outcome.error);
    return;
  }
  const { matches, truncated } = outcome.result;
  lastMatches = matches;
  renderText(matches);
  const n = matches.length;
  matchCount.textContent = `${n}${truncated ? '+' : ''} match${n === 1 ? '' : 'es'} · ${outcome.ms.toFixed(1)} ms`;
  renderMatches(outcome.result);
}, 120);

function syncTextScroll(): void {
  textBackdrop.scrollTop = textInput.scrollTop;
  textBackdrop.scrollLeft = textInput.scrollLeft;
}

// ---------- library ----------

function renderLibrary(): void {
  libraryList.replaceChildren(
    ...LIBRARY.map((entry) =>
      h(
        'li',
        {},
        h(
          'button',
          { type: 'button', class: 'lib-item', 'data-id': entry.id },
          h('span', { class: 'lib-name' }, entry.name),
          h('span', { class: 'lib-desc' }, entry.description),
          h('code', { class: 'lib-src' }, `/${entry.pattern}/${entry.flags}`),
        ),
      ),
    ),
  );
}

libraryList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  const entry = LIBRARY.find((p) => p.id === button?.dataset.id);
  if (!entry) return;
  load({ pattern: entry.pattern, flags: entry.flags, text: entry.sample });
  patternInput.focus();
});

// ---------- share ----------

shareButton.addEventListener('click', async () => {
  const { hash, truncated } = encodeState(state);
  history.replaceState(null, '', hash);
  let message = 'Link copied to the clipboard.';
  try {
    await navigator.clipboard.writeText(location.href);
  } catch {
    message = 'The link is in the address bar — copy it from there.';
  }
  if (truncated) message += ' The test text was shortened to fit in the link.';
  matchCount.textContent = message;
});

// ---------- wiring ----------

function refresh(): void {
  renderExplanation();
  runMatches();
}

function load(next: PlaygroundState): void {
  state = next;
  patternInput.value = state.pattern;
  textInput.value = state.text;
  renderFlags();
  refresh();
}

patternInput.addEventListener('input', () => {
  state = { ...state, pattern: patternInput.value };
  refresh();
});
patternInput.addEventListener('scroll', () => (patternBackdrop.scrollLeft = patternInput.scrollLeft));
textInput.addEventListener('input', () => {
  state = { ...state, text: textInput.value };
  // Show the old highlights shifted as little as possible until the worker answers.
  renderText(lastMatches.filter((m) => m.end <= state.text.length));
  runMatches();
});
textInput.addEventListener('scroll', syncTextScroll);
window.addEventListener('hashchange', () => {
  const shared = decodeState(location.hash);
  if (shared) load(shared);
});

renderLibrary();
load(state);
