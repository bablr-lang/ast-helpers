import {
  buildReference,
  buildGap,
  buildEmbeddedNode,
  buildNodeOpenTag,
  buildNodeCloseTag,
  buildLiteral,
  buildNode,
  buildGapNode,
  buildSyntacticNode,
  buildSyntacticIntrinsicNode,
  buildEscapeNode,
  buildSyntacticEscapeNode,
  buildSyntacticTriviaNode,
  buildTriviaNode,
  buildNullNode,
  buildArray,
} from './builders.js';

export * from './builders.js';

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
    const name = pathIsArray ? path[0].slice(0, -2) : path[0];
    return buildReference(name, pathIsArray);
  } else {
    const { name, isArray: pathIsArray } = path;
    return buildReference(name, pathIsArray);
  }
};

export const lit = (str) => buildLiteral(stripArray(str));

export const gap = buildGap;
export const arr = buildArray;
export const embedded = buildEmbeddedNode;
export const nodeOpen = buildNodeOpenTag;
export const nodeClose = buildNodeCloseTag;
export const node = buildNode;
export const g_node = buildGapNode;
export const s_node = buildSyntacticNode;
export const s_i_node = buildSyntacticIntrinsicNode;
export const e_node = buildEscapeNode;
export const s_e_node = buildSyntacticEscapeNode;
export const s_t_node = buildSyntacticTriviaNode;
export const t_node = buildTriviaNode;
export const null_node = buildNullNode;
