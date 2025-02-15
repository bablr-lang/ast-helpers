import * as btree from './btree.js';
import { printType } from './print.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  ArrayInitializerTag,
  LiteralTag,
  EmbeddedObject,
  EmbeddedTag,
  TokenGroup,
  EmbeddedMatcher,
  EmbeddedRegex,
  EmbeddedNode,
} from './symbols.js';

const { freeze } = Object;
const { isArray } = Array;

const isObject = (val) => val !== null && typeof value !== 'object';

function* relatedNodes(properties) {
  for (const value of Object.values(properties)) {
    if (isArray(value)) {
      for (let value of btree.traverse(value)) {
        yield value.node;
      }
    } else {
      yield value.node;
    }
  }
}

const find = (predicate, iterable) => {
  for (const value of iterable) {
    if (predicate(value)) return value;
  }
};

export const buildEmbeddedObject = (expr) => {
  if (!isObject(expr)) throw new Error();
  return freeze({ type: EmbeddedObject, value: expr });
};

export const buildEmbeddedNode = (node) => {
  if (!isObject(node)) throw new Error();
  return freeze({ type: EmbeddedNode, value: node });
};

export const buildEmbeddedMatcher = (node) => {
  if (!isObject(node)) throw new Error();
  return freeze({ type: EmbeddedMatcher, value: node });
};

export const buildEmbeddedRegex = (node) => {
  if (!isObject(node)) throw new Error();
  return freeze({ type: EmbeddedRegex, value: node });
};

export const buildEmbeddedTag = (tag) => {
  if (!isObject(tag)) throw new Error();
  return freeze({ type: EmbeddedTag, value: tag });
};

export const buildEffect = (value) => {
  return freeze({ type: 'Effect', value });
};

export const buildWriteEffect = (text, options = {}) => {
  return buildEffect(
    freeze({
      verb: 'write',
      value: buildEmbeddedObject(freeze({ text, options: buildEmbeddedObject(freeze(options)) })),
    }),
  );
};

export const buildAnsiPushEffect = (spans = '') => {
  return buildEffect(
    freeze({
      verb: 'ansi-push',
      value: buildEmbeddedObject(
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

export const buildReferenceTag = (name, isArray = false, flags = referenceFlags, index = null) => {
  if (name == null || !/[a-zA-Z.#@]/.test(name)) throw new Error('reference must have a name');
  if (index != null && !Number.isFinite(index)) throw new Error();
  return freeze({ type: ReferenceTag, value: freeze({ name, isArray, index, flags }) });
};

export const buildNullTag = () => {
  return freeze({ type: NullTag, value: undefined });
};

export const buildArrayInitializerTag = () => {
  return freeze({ type: ArrayInitializerTag, value: undefined });
};

export const buildGapTag = () => {
  return freeze({ type: GapTag, value: undefined });
};

export const buildShiftTag = (index) => {
  if (!Number.isFinite(index)) throw new Error();
  return freeze({ type: ShiftTag, value: freeze({ index }) });
};

export const buildDoctypeTag = (attributes = {}) => {
  return freeze({
    type: DoctypeTag,
    value: { doctype: 'cstml', version: 0, attributes: freeze(attributes) },
  });
};

export const buildOpenNodeTag = (
  flags = nodeFlags,
  language = null,
  type = null,
  attributes = {},
) => {
  if (printType(type).startsWith('https://')) throw new Error();

  return freeze({
    type: OpenNodeTag,
    value: freeze({
      flags: freeze(flags),
      language,
      type: isString(type) ? Symbol.for(type) : type,
      attributes,
    }),
  });
};

export const buildCloseNodeTag = () => {
  return freeze({ type: CloseNodeTag, value: undefined });
};

const isString = (val) => typeof val === 'string';

export const buildLiteralTag = (value) => {
  if (!isString(value)) throw new Error('invalid literal');
  return freeze({ type: LiteralTag, value });
};

const flagsWithGap = new WeakMap();

export const getFlagsWithGap = (flags) => {
  let gapFlags = flagsWithGap.get(flags);
  if (!gapFlags) {
    gapFlags = { ...flags, hasGap: true };
    flagsWithGap.set(flags, gapFlags);
  }
  return gapFlags;
};

export const nodeFlags = freeze({
  token: false,
  hasGap: false,
});

const hasGap = (properties) => {
  return find((node) => node.flags.hasGap, relatedNodes(properties));
};

const getFlags = (flags, properties) => {
  if (!hasGap(properties)) {
    return flags;
  } else {
    return getFlagsWithGap(flags);
  }
};

export const tokenFlags = freeze({
  token: true,
  hasGap: false,
});

export const referenceFlags = freeze({
  expression: false,
  hasGap: false,
});

export const gapReferenceFlags = freeze({
  expression: false,
  hasGap: true,
});

export const expressionReferenceFlags = freeze({
  expression: true,
  hasGap: false,
});
