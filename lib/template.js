import * as t from './builders.js';
import { LiteralTag, EmbeddedNode } from './symbols.js';
import * as btree from './btree.js';

const { isArray } = Array;
const { freeze } = Object;
const { isFinite } = Number;

export const interpolateArray = (value) => {
  if (isArray(value)) {
    if (isFinite(value[0])) {
      return [...btree.traverse(value)];
    } else {
      return value;
    }
  } else {
    return [value];
  }
};

export const interpolateArrayChildren = (value, ref, sep) => {
  if (isArray(value)) {
    const values = value;
    const children = [];
    let first = true;
    for (const _ of values) {
      if (!first) children.push(freeze({ ...sep }));
      children.push(freeze({ ...ref }));
      first = false;
    }
    return children;
  } else {
    return [freeze({ ...ref })];
  }
};

const validateTag = (tag) => {
  if (!tag || (tag.type !== LiteralTag && tag.type !== EmbeddedNode)) {
    throw new Error('Invalid tag');
  }
  if (tag.type === EmbeddedNode && !tag.value.flags.escape) {
    throw new Error();
  }
};

export const interpolateString = (value) => {
  const tags = [];
  if (isArray(value)) {
    for (const element of value) {
      validateTag(element);

      tags.push(element);
    }
  } else {
    // we can't safely interpolate strings here, though I wish we could
    validateTag(value);
    tags.push(value);
  }

  return t.buildNode('String', 'Content', tags);
};
