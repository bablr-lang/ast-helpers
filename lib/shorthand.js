import {
  buildReferenceTag,
  buildGapTag,
  buildEmbeddedNode,
  buildNodeOpenTag,
  buildNodeCloseTag,
  buildLiteralTag,
  buildNullNode,
  buildArrayTag,
  buildNode,
  buildFragment,
  buildGapNode,
  buildSyntacticNode,
  buildEscapeNode,
  buildSyntacticEscapeNode,
  buildSyntacticTriviaNode,
  buildTriviaNode,
} from './builders.js';
import { parsePath } from './path.js';

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
  const { name, isArray: pathIsArray } = parsePath(isArray(path) ? path[0] : path);

  return buildReferenceTag(name, pathIsArray);
};

export const lit = (str) => buildLiteralTag(stripArray(str));

export const gap = buildGapTag;
export const arr = buildArrayTag;
export const embedded = buildEmbeddedNode;
export const nodeOpen = buildNodeOpenTag;
export const nodeClose = buildNodeCloseTag;
export const node = buildNode;
export const frag = buildFragment;
export const g_node = buildGapNode;
export const s_node = buildSyntacticNode;
export const e_node = buildEscapeNode;
export const s_e_node = buildSyntacticEscapeNode;
export const s_t_node = buildSyntacticTriviaNode;
export const t_node = buildTriviaNode;
export const null_node = buildNullNode;
