const { freeze } = Object;

export const buildReference = (pathName, pathIsArray) => {
  return freeze({ type: 'Reference', value: freeze({ pathName, pathIsArray }) });
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

export const buildNodeOpenTag = (flags, type, attributes = {}) => {
  let { token, trivia, escape } = flags;

  token = !!token;
  trivia = !!trivia;
  escape = !!escape;

  return freeze({
    type: 'OpenNodeTag',
    value: freeze({ flags: freeze({ token, trivia, escape }), type, attributes }),
  });
};

const fragmentFlags = freeze({ escape: false, trivia: false });

export const buildFragmentOpenTag = (flags = fragmentFlags) => {
  let { trivia, escape } = flags;

  trivia = !!trivia;
  escape = !!escape;

  return freeze({ type: 'OpenFragmentTag', value: freeze({ flags: freeze({ trivia, escape }) }) });
};

export const buildNodeCloseTag = (type = null) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ type }) });
};

export const buildFragmentCloseTag = () => {
  return freeze({ type: 'CloseFragmentTag', value: freeze({}) });
};

export const buildLiteral = (value) => {
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

const nodeFlags = freeze({ token: false, escape: false, trivia: false });

export const buildNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: nodeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

const syntacticFlags = freeze({ token: true, escape: false, trivia: false });

export const buildSyntacticNode = (language, type, value, attributes = {}) =>
  freeze({
    flags: syntacticFlags,
    language,
    type,
    children: [buildLiteral(value)],
    properties: freeze({}),
    attributes: freeze(attributes),
  });

const escapeFlags = freeze({ token: false, escape: true, trivia: false });

export const buildEscapeNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: escapeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

const syntacticEscapeFlags = freeze({ token: true, escape: true, trivia: false });

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

const syntacticTriviaFlags = freeze({ token: true, escape: false, trivia: true });

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

const triviaFlags = freeze({ token: false, escape: false, trivia: true });

export const buildTriviaNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: triviaFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });
