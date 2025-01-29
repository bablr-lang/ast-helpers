import * as t from './builders.js';
import {
  ReferenceTag,
  ArrayInitializerTag,
  OpenFragmentTag,
  OpenNodeTag,
  DoctypeTag,
  CloseFragmentTag,
  EmbeddedNode,
  GapTag,
} from './symbols.js';
import * as btree from './btree.js';
import { getOpenTag, get } from './tree.js';

const { freeze } = Object;

export const buildFilledGapFunction = (expressions) => (value) => {
  expressions.push(value);
  return t.buildGapTag();
};

export function* interpolateFragment(node, ref, expressions) {
  const open = getOpenTag(node);

  if (node.type !== null) throw new Error();

  const gap = buildFilledGapFunction(expressions);

  const counters = new Map();

  if (open.type === OpenFragmentTag) {
    let currentRef = null;
    for (let tag of btree.traverse(node.children)) {
      switch (tag.type) {
        case DoctypeTag:
        case OpenFragmentTag:
        case CloseFragmentTag: {
          break;
        }

        case ReferenceTag: {
          currentRef = tag;
          break;
        }

        case ArrayInitializerTag: {
          const { name } = currentRef.value;
          counters.set(name, -1);
          if (name === '.') {
            yield freeze({ ...ref });
          } else {
            yield currentRef;
          }
          yield tag;
          break;
        }

        case GapTag: {
          const { name, isArray, flags } = currentRef.value;

          if (name === '.') {
            // TODO check/combine flags
            yield freeze({ ...ref });
          } else {
            yield currentRef;
          }

          const count = counters.get(name) + 1;

          counters.set(name, count);

          const resolvedRef = t.buildReferenceTag(name, isArray, flags, count);

          yield gap(get(resolvedRef, node));

          break;
        }

        case EmbeddedNode: {
          const { name } = currentRef.value;
          if (name === '.') {
            yield freeze({ ...ref });
          } else {
            yield currentRef;
          }
          yield gap(tag.value);
          break;
        }

        default: {
          yield tag;
        }
      }
    }
  } else if (open.type === OpenNodeTag) {
    yield freeze({ ...ref });
    yield gap(get(ref, node));
  } else {
    throw new Error();
  }
}
