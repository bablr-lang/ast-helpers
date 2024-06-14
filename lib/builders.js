const { freeze } = Object;

export const buildReference = (name, isArray) => {
  return freeze({ type: 'Reference', value: freeze({ name, isArray }) });
};

export const buildNull = () => {
  return freeze({ type: 'Null', value: undefined });
};

export const buildGap = () => {
  return freeze({ type: 'Gap', value: undefined });
};

export const buildEmbedded = (node) => {
  return freeze({ type: 'Embedded', value: node });
};

export const buildDoctypeTag = (attributes) => {
  return freeze({
    type: 'DoctypeTag',
    value: { doctype: 'cstml', version: 0, attributes: freeze(attributes) },
  });
};

export const buildNodeOpenTag = (flags, language, type, intrinsicValue, attributes = {}) => {
  let { token, trivia, escape, expression, intrinsic } = flags;

  if (!type) throw new Error();

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
      intrinsicValue,
      attributes,
    }),
  });
};

export const buildFragmentOpenTag = (flags = nodeFlags, language) => {
  let { token, trivia, escape } = flags;

  token = !!token;
  trivia = !!trivia;
  escape = !!escape;

  return freeze({
    type: 'OpenFragmentTag',
    value: freeze({ flags: freeze({ token, trivia, escape }) }),
  });
};

export const buildNodeCloseTag = (type = null, language = null) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ language, type }) });
};

export const buildFragmentCloseTag = () => {
  return freeze({ type: 'CloseFragmentTag', value: freeze({}) });
};

const isString = (val) => typeof val === 'string';

export const buildLiteral = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return freeze({ type: 'Literal', value });
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
