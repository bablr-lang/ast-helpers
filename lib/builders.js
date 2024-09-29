import * as sym from './symbols.js';
import * as btree from './btree.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
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

const isObject = (val) => val !== null && typeof value !== 'object';

export const buildEmbeddedExpression = (expr) => {
  if (!isObject(expr)) return expr;
  return freeze({ type: EmbeddedExpression, value: expr });
};

export const buildEmbeddedTag = (tag) => {
  return freeze({ type: EmbeddedTag, value: tag });
};

export const buildEffect = (value) => {
  return freeze({ type: 'Effect', value });
};

export const buildWriteEffect = (text, options = {}) => {
  return buildEffect(
    buildEmbeddedExpression(
      freeze({
        verb: 'write',
        value: buildEmbeddedExpression(
          freeze({ text, options: buildEmbeddedExpression(freeze(options)) }),
        ),
      }),
    ),
  );
};

export const buildAnsiPushEffect = (spans = '') => {
  return buildEffect(
    buildEmbeddedExpression(
      freeze({
        verb: 'ansi-push',
        value: buildEmbeddedExpression(
          freeze({ spans: spans === '' ? freeze([]) : freeze(spans.split(' ')) }),
        ),
      }),
    ),
  );
};

export const buildAnsiPopEffect = () => {
  return buildEffect(buildEmbeddedExpression(freeze({ verb: 'ansi-pop', value: undefined })));
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

export const buildReferenceTag = (name, isArray = false) => {
  return freeze({ type: ReferenceTag, value: freeze({ name, isArray }) });
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

export const buildDoctypeTag = (attributes) => {
  return freeze({
    type: DoctypeTag,
    value: { doctype: 'cstml', version: 0, attributes: freeze(attributes) },
  });
};

export const buildNodeOpenTag = (flags = {}, language = null, type = null, attributes = {}) => {
  let { token, trivia, escape, expression, intrinsic } = flags;

  token = !!token;
  trivia = !!trivia;
  escape = !!escape;
  expression = !!expression;
  intrinsic = !!intrinsic;

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze({ token, trivia, escape, intrinsic, expression }),
      language,
      type,
      attributes,
    }),
  });
};

export const buildNodeCloseTag = (type = null, language = null) => {
  return freeze({ type: CloseNodeTag, value: freeze({ language, type }) });
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
  const openTag = buildNodeOpenTag(nodeFlags, language, type, attributes);
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

export const nodeFlags = freeze({
  token: false,
  escape: false,
  trivia: false,
  intrinsic: false,
  expression: false,
});

export const buildNode = (language, type, children = [], properties = {}, attributes = {}) => {
  return buildNodeWithFlags(nodeFlags, language, type, children, properties, attributes);
};

export const syntacticFlags = freeze({
  token: true,
  escape: false,
  trivia: false,
  intrinsic: false,
  expression: false,
});

export const buildSyntacticNode = (language, type, value, attributes = {}) => {
  return buildNodeWithFlags(
    syntacticFlags,
    language,
    type,
    [buildLiteralTag(value)],
    {},
    attributes,
  );
};

export const syntacticIntrinsicFlags = freeze({
  token: true,
  escape: false,
  trivia: false,
  intrinsic: true,
  expression: false,
});
export const buildSyntacticIntrinsicNode = (language, type, value, attributes = {}) => {
  return buildNodeWithFlags(
    syntacticIntrinsicFlags,
    language,
    type,
    [buildLiteralTag(value)],
    {},
    attributes,
  );
};

export const escapeFlags = freeze({
  token: false,
  escape: true,
  trivia: false,
  intrinsic: false,
  expression: false,
});

export const buildEscapeNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  return buildNodeWithFlags(escapeFlags, language, type, children, properties, attributes);
};

export const syntacticEscapeFlags = freeze({
  token: true,
  escape: true,
  trivia: false,
  intrinsic: false,
  expression: false,
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
  intrinsic: false,
  expression: false,
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
  intrinsic: false,
  expression: false,
});

export const buildTriviaNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) => {
  return buildNodeWithFlags(triviaFlags, language, type, children, properties, attributes);
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
    flags: nodeFlags,
    language: null,
    type: sym.gap,
    children: btree.freeze([gapToken]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};
