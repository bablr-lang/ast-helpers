import * as sym from './symbols.js';

const { freeze } = Object;

const isObject = (val) => val !== null && typeof value !== 'object';

export const buildEmbeddedExpression = (expr) => {
  if (!isObject(expr)) return expr;
  return freeze({ type: 'EmbeddedExpression', value: expr });
};

export const buildEmbeddedTag = (tag) => {
  return freeze({ type: 'EmbeddedTag', value: tag });
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
  return freeze({ type: 'TokenGroup', value: tokens });
};

export const buildCall = (verb, ...args) => {
  return { verb, arguments: args };
};

export const buildBeginningOfStreamToken = () => {
  return freeze({ type: Symbol.for('@bablr/beginning-of-stream'), value: undefined });
};

export const buildReference = (name, isArray) => {
  return freeze({ type: 'Reference', value: freeze({ name, isArray }) });
};

export const buildNull = () => {
  return freeze({ type: 'Null', value: undefined });
};

export const buildGap = () => {
  return freeze({ type: 'Gap', value: undefined });
};

export const buildShift = () => {
  return freeze({ type: 'Shift', value: undefined });
};

export const buildEmbeddedNode = (node) => {
  return freeze({ type: 'EmbeddedNode', value: node });
};

export const buildDoctypeTag = (attributes) => {
  return freeze({
    type: 'DoctypeTag',
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
    type: 'OpenNodeTag',
    value: freeze({
      flags: freeze({ token, trivia, escape, intrinsic, expression }),
      language,
      type,
      attributes,
    }),
  });
};

export const buildNodeCloseTag = (type = null, language = null) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ language, type }) });
};

const isString = (val) => typeof val === 'string';

export const buildLiteral = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return freeze({ type: 'LiteralTag', value });
};

export const buildNodeWithFlags = (
  flags,
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) =>
  freeze({
    flags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

export const nodeFlags = freeze({
  token: false,
  escape: false,
  trivia: false,
  intrinsic: false,
  expression: false,
});

export const buildNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: nodeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

export const syntacticFlags = freeze({
  token: true,
  escape: false,
  trivia: false,
  intrinsic: false,
  expression: false,
});

export const buildSyntacticNode = (language, type, value, attributes = {}) =>
  freeze({
    flags: syntacticFlags,
    language,
    type,
    children: [buildLiteral(value)],
    properties: freeze({}),
    attributes: freeze(attributes),
  });

export const syntacticIntrinsicFlags = freeze({
  token: true,
  escape: false,
  trivia: false,
  intrinsic: true,
  expression: false,
});
export const buildSyntacticIntrinsicNode = (language, type, value, attributes = {}) =>
  freeze({
    flags: syntacticIntrinsicFlags,
    language,
    type,
    children: [buildLiteral(value)],
    properties: freeze({}),
    attributes: freeze(attributes),
  });

export const escapeFlags = freeze({
  token: false,
  escape: true,
  trivia: false,
  intrinsic: false,
  expression: false,
});

export const buildEscapeNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: escapeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

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
) =>
  freeze({
    flags: syntacticEscapeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

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
) =>
  freeze({
    flags: syntacticTriviaFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

export const triviaFlags = freeze({
  token: false,
  escape: false,
  trivia: true,
  intrinsic: false,
  expression: false,
});

export const buildTriviaNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: triviaFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

export const buildNullNode = (nullToken = buildNull()) => {
  return freeze({
    flags: nodeFlags,
    language: null,
    type: sym.null,
    children: freeze([nullToken]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};

export const buildGapNode = (gapToken = buildGap()) => {
  return freeze({
    flags: nodeFlags,
    language: null,
    type: sym.gap,
    children: freeze([gapToken]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};
