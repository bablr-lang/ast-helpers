import {
  buildReference,
  buildGap,
  buildEmbedded,
  buildNodeOpenTag,
  buildFragmentOpenTag,
  buildNodeCloseTag,
  buildFragmentCloseTag,
  buildLiteral,
  buildNode,
  buildSyntacticNode,
  buildEscapeNode,
  buildSyntacticEscapeNode,
  buildTriviaNode,
} from './builders.js';

const { isArray } = Array;

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
  if (isArray(path)) {
    const pathIsArray = path[0].endsWith('[]');
    const pathName = pathIsArray ? path[0].slice(0, -2) : path[0];
    return buildReference(pathName, pathIsArray);
  } else {
    const { pathName, pathIsArray } = path;
    return buildReference(pathName, pathIsArray);
  }
};

export const lit = (str) => buildLiteral(stripArray(str));

export const gap = buildGap;
export const embedded = buildEmbedded;
export const nodeOpen = buildNodeOpenTag;
export const fragOpen = buildFragmentOpenTag;
export const nodeClose = buildNodeCloseTag;
export const fragClose = buildFragmentCloseTag;
export const node = buildNode;
export const s_node = buildSyntacticNode;
export const e_node = buildEscapeNode;
export const s_e_node = buildSyntacticEscapeNode;
export const t_node = buildTriviaNode;
