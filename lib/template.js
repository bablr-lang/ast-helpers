import * as t from './builders.js';
import {
  LiteralTag,
  EmbeddedNode,
  ReferenceTag,
  ArrayTag,
  OpenFragmentTag,
  OpenNodeTag,
  DoctypeTag,
  CloseFragmentTag,
} from './symbols.js';
import * as btree from './btree.js';
import { getOpenTag, getRoot } from './tree.js';

const { isArray } = Array;
const { freeze } = Object;
const { isFinite } = Number;

export const interpolateArray = (fragment) => {
  const value = getRoot(fragment);

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

export function* interpolateFragmentChildren(value, ref) {
  const open = getOpenTag(value);

  if (open.type === OpenFragmentTag) {
    let currentRef = null;
    for (let child of btree.traverse(value.children)) {
      if (
        child.type === DoctypeTag ||
        child.type === OpenFragmentTag ||
        child.type === CloseFragmentTag
      ) {
        continue;
      }

      if (child.type === ArrayTag) {
        // if (notAlreadyInitialized) {
        yield child;
        // }
      } else if (child.type === ReferenceTag) {
        currentRef = child;
        if (child.value.name === '.') {
          yield freeze({ ...ref });
        } else {
          yield child;
        }
      } else {
        yield child;
      }
    }
  } else if (open.type === OpenNodeTag) {
    yield freeze({ ...ref });
  } else {
    throw new Error();
  }
}

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
