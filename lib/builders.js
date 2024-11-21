import * as sym from './symbols.js';
import * as btree from './btree.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  OpenFragmentTag,
  CloseFragmentTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  ArrayTag,
  LiteralTag,
  EmbeddedNode,
  EmbeddedExpression,
  EmbeddedTag,
  TokenGroup,
} from './symbols.js';

const { freeze } = Object;
const { isArray } = Array;

const isObject = (val) => val !== null && typeof value !== 'object';

function* relatedNodes(properties) {
  for (const value of Object.values(properties)) {
    if (isArray(value)) {
      yield* btree.traverse(value);
    } else {
      yield value;
    }
  }
}

const find = (predicate, iterable) => {
  for (const value of iterable) {
    if (predicate(value)) return value;
  }
};

export const buildEmbeddedExpression = (expr) => {
  if (!isObject(expr)) return expr;
  return freeze({ type: EmbeddedExpression, value: expr });
};

export const buildEmbeddedTag = (tag) => {
  if (!isObject(tag)) return tag;
  return freeze({ type: EmbeddedTag, value: tag });
};

export const buildEffect = (value) => {
  return freeze({ type: 'Effect', value });
};

export const buildWriteEffect = (text, options = {}) => {
  return buildEffect(
    freeze({
      verb: 'write',
      value: buildEmbeddedExpression(
        freeze({ text, options: buildEmbeddedExpression(freeze(options)) }),
      ),
    }),
  );
};

export const buildYieldEffect = (tag) => {
  return buildEffect(
    freeze({
      verb: 'yield',
      value: buildEmbeddedTag(freeze(tag)),
    }),
  );
};

export const buildAnsiPushEffect = (spans = '') => {
  return buildEffect(
    freeze({
      verb: 'ansi-push',
      value: buildEmbeddedExpression(
        freeze({ spans: spans === '' ? freeze([]) : freeze(spans.split(' ')) }),
      ),
    }),
  );
};

export const buildAnsiPopEffect = () => {
  return buildEffect(freeze({ verb: 'ansi-pop', value: undefined }));
};

export const buildTokenGroup = (tokens) => {
  return freeze({ type: TokenGroup, value: tokens });
};

export const buildCall = (verb, ...args) => {
  return { verb, arguments: args };
};

export const buildBeginningOfStreamToken = () => {
  return freeze({ type: Symbol.for('@bablr/beginning-of-stream'), value: undefined });
};

export const buildReferenceTag = (name, isArray = false, hasGap = false) => {
  return freeze({ type: ReferenceTag, value: freeze({ name, isArray, hasGap }) });
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
};

export const buildArrayTag = () => {
  return freeze({ type: ArrayTag, value: undefined });
};

export const buildGapTag = () => {
  return freeze({ type: GapTag, value: undefined });
};

export const buildShiftTag = () => {
  return freeze({ type: ShiftTag, value: undefined });
};

export const buildEmbeddedNode = (node) => {
  return freeze({ type: EmbeddedNode, value: node });
};

export const buildDoctypeTag = (attributes = {}) => {
  return freeze({
    type: DoctypeTag,
    value: { doctype: 'cstml', version: 0, attributes: freeze(attributes) },
  });
};

export const buildNodeOpenTag = (flags = {}, language = null, type = null, attributes = {}) => {
  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      language,
      type,
      attributes,
    }),
  });
};

export const buildNodeCloseTag = (type = null, language = null) => {
  return freeze({ type: CloseNodeTag, value: freeze({ language, type }) });
};

export const buildFragmentOpenTag = (flags = {}) => {
  return freeze({
    type: OpenFragmentTag,
    value: freeze({
      flags: freeze(flags),
    }),
  });
};

export const buildFragmentCloseTag = (type = null, language = null) => {
  return freeze({ type: CloseFragmentTag, value: freeze({ language, type }) });
};

export const wrapFragment = (node) => {
  return buildFragment([buildReferenceTag('.')], { '.': node });
};

const isString = (val) => typeof val === 'string';

export const buildLiteralTag = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return freeze({ type: LiteralTag, value });
};

export const buildNodeWithFlags = (
  flags,
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  const openTag = buildNodeOpenTag(flags, language, type, attributes);
  const closeTag = buildNodeCloseTag(type);

  return freeze({
    flags,
    language,
    type,
    children: btree.addAt(0, btree.addAt(btree.getSum(children), children, closeTag), openTag),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });
};

const flagsWithGap = new WeakMap();

export const getFlagsWithGap = (flags) => flagsWithGap.get(flags);

export const nodeFlags = freeze({
  token: false,
  escape: false,
  trivia: false,
  expression: false,
  hasGap: false,
});

const hasGap = (flags, children, properties) => {
  return find((node) => node.flags.hasGap, relatedNodes(properties));
};

const getGapFlags = (flags) => {
  let gapFlags = flagsWithGap.get(flags);
  if (!gapFlags) {
    gapFlags = { ...flags, hasGap: true };
    flagsWithGap.set(flags, gapFlags);
  }
  return gapFlags;
};

const getFlags = (flags, children, properties) => {
  if (!hasGap(flags, children, properties)) {
    return flags;
  } else {
    return getGapFlags(flags);
  }
};

export const buildNode = (language, type, children = [], properties = {}, attributes = {}) => {
  const flags = getFlags(nodeFlags, children, properties);
  return buildNodeWithFlags(flags, language, type, children, properties, attributes);
};

export const buildFragmentWithFlags = (flags, children = [], properties = {}, attributes = {}) => {
  const doctypeTag = buildDoctypeTag(attributes);
  const openTag = buildFragmentOpenTag(flags);
  const closeTag = buildFragmentCloseTag();

  return freeze({
    flags,
    children: btree.addAt(
      0,
      btree.addAt(0, btree.addAt(btree.getSum(children), children, closeTag), openTag),
      doctypeTag,
    ),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });
};

export const buildFragment = (children = [], properties = {}, attributes = {}) => {
  const flags = getFlags(nodeFlags, children, properties);
  return buildFragmentWithFlags(flags, children, properties, attributes);
};

export const syntacticFlags = freeze({
  token: true,
  escape: false,
  trivia: false,
  expression: false,
  hasGap: false,
});

export const buildSyntacticNode = (language, type, value) => {
  return buildNodeWithFlags(syntacticFlags, language, type, [buildLiteralTag(value)]);
};

export const escapeFlags = freeze({
  token: false,
  escape: true,
  trivia: false,
  expression: false,
  hasGap: false,
});

export const buildEscapeNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  const flags = getFlags(escapeFlags, children, properties);
  return buildNodeWithFlags(flags, language, type, children, properties, attributes);
};

export const syntacticEscapeFlags = freeze({
  token: true,
  escape: true,
  trivia: false,
  expression: false,
  hasGap: false,
});

export const buildSyntacticEscapeNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  return buildNodeWithFlags(syntacticEscapeFlags, language, type, children, properties, attributes);
};

export const syntacticTriviaFlags = freeze({
  token: true,
  escape: false,
  trivia: true,
  expression: false,
  hasGap: false,
});

export const buildSyntacticTriviaNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  return buildNodeWithFlags(syntacticTriviaFlags, language, type, children, properties, attributes);
};

export const triviaFlags = freeze({
  token: false,
  escape: false,
  trivia: true,
  expression: false,
  hasGap: false,
});

export const buildTriviaNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  const flags = getFlags(triviaFlags, children, properties);
  return buildNodeWithFlags(flags, language, type, children, properties, attributes);
};

export const buildNullNode = (nullToken = buildNullTag()) => {
  return freeze({
    flags: nodeFlags,
    language: null,
    type: sym.null,
    children: btree.freeze([nullToken]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};

export const buildGapNode = (gapToken = buildGapTag()) => {
  return freeze({
    flags: getGapFlags(nodeFlags),
    language: null,
    type: sym.gap,
    children: btree.freeze([gapToken]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};
