import {
  buildDoctypeTag,
  buildReferenceTag,
  buildGapTag,
  buildNodeOpenTag,
  buildNodeCloseTag,
  buildFragmentOpenTag,
  buildFragmentCloseTag,
  buildLiteralTag,
  buildArrayInitializerTag,
} from './builders.js';
import { treeFromStreamSync } from './tree.js';

export * from './builders.js';

const { isArray } = Array;

export const parseRef = (str) => {
  let {
    1: name,
    2: isArray,
    3: index,
    4: expressionToken,
    5: hasGapToken,
  } = /^\s*([.#@]|[a-zA-Z]+)\s*(\[\s*(\d+\s*)?\])?\s*(\+)?(\$)?\s*$/.exec(str);

  let flags = {
    expression: !!expressionToken,
    hasGap: !!hasGapToken,
  };

  index = index ? parseInt(index, 10) : null;
  isArray = !!isArray;
  name = name || null;

  return buildReferenceTag(name, isArray, flags, index);
};

const stripArray = (val) => {
  if (isArray(val)) {
    if (val.length > 1) {
      throw new Error();
    }
    return val[0];
  } else {
    return val;
  }
};

export const ref = (path) => {
  return parseRef(isArray(path) ? path[0] : path);
};

export const lit = (str) => buildLiteralTag(stripArray(str));

export const doctype = buildDoctypeTag;
export const gap = buildGapTag;
export const arr = buildArrayInitializerTag;
export const nodeOpen = buildNodeOpenTag;
export const nodeClose = buildNodeCloseTag;
export const fragOpen = buildFragmentOpenTag;
export const fragClose = buildFragmentCloseTag;
export const tree = (...tags) => treeFromStreamSync(tags);
