import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { nodeFlags, buildReferenceTag, buildNullTag } from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  printSource as printSourceFromStream,
  getStreamIterator,
} from './stream.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  OpenFragmentTag,
  CloseFragmentTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  ArrayInitializerTag,
  LiteralTag,
  EmbeddedNode,
} from './symbols.js';
import * as btree from './btree.js';
import * as sym from './symbols.js';
export * from './builders.js';
export * from './print.js';
import { add, get, TagPath, Path } from './path.js';
export { add, get } from './path.js';

const isString = (str) => typeof str === 'string';

const { isArray } = Array;
const { freeze } = Object;

const mergeReferences = (outer, inner) => {
  let {
    name,
    isArray,
    index,
    flags: { expression, hasGap },
  } = outer.value;

  if (name === '.' && inner.value.name !== '.') throw new Error();

  isArray = isArray || inner.value.isArray;
  expression = expression || inner.value.expression;
  hasGap = hasGap || inner.value.hasGap;

  return buildReferenceTag(name, isArray, { expression, hasGap }, index);
};

function* __treeFromStream(tags, options) {
  let path = null;
  let rootPath = null;
  let held = null;
  let doctype = null;
  const co = new Coroutine(getStreamIterator(tags));
  const expressionsCo = new Coroutine(getStreamIterator(options.expressions || []));
  let reference = null;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    const tag = co.value;

    if (tag.type === 'Effect') {
      continue;
    }

    if (tag.type === DoctypeTag) {
      doctype = tag;
      continue;
    }

    if (held && tag.type !== OpenNodeTag && tag.type !== GapTag) {
      throw new Error('cannot eat this type of tag while holding');
    }

    let suppressTag = false;

    switch (tag.type) {
      case LiteralTag:
      case CloseNodeTag:
      case CloseFragmentTag: {
        break;
      }

      case ReferenceTag: {
        reference = tag;
        suppressTag = true;
        break;
      }

      case ArrayInitializerTag: {
        add(path.node, reference, []);
        suppressTag = true;
        reference = null;
        break;
      }

      case NullTag:
      case GapTag: {
        if (tag.type === GapTag && path.node.type === null && path.node.flags.token) {
          throw new Error('not implemented');
        }

        if (!path) {
          return buildStubNode(tag);
        }

        const isGap = tag.type === GapTag;

        if (path.parent && reference.type !== ReferenceTag) throw new Error();

        let node = createNode(tag);

        if (isGap) {
          if (held) {
            node = held;
            add(path.node, reference, node);
            suppressTag = true;
          } else if (!expressionsCo.done) {
            expressionsCo.advance();

            if (!expressionsCo.done) {
              node = node == null ? buildStubNode(buildNullTag()) : expressionsCo.value;
              suppressTag = true;

              if (node.type == null) {
                const { name, isArray } = reference.value;

                const parentNode = path.node;

                let outerReference = reference;

                for (const tag of btree.traverse(node.children)) {
                  switch (tag.type) {
                    case DoctypeTag:
                    case OpenFragmentTag:
                    case CloseFragmentTag: {
                      break;
                    }

                    case ReferenceTag:
                      // combine tags for .

                      reference = mergeReferences(outerReference, tag);
                      break;

                    case ArrayInitializerTag: {
                      add(parentNode, reference, []);
                      break;
                    }

                    case EmbeddedNode: {
                      add(parentNode, reference, tag.value);
                      break;
                    }

                    case GapTag: {
                      const resolvedNode = get(reference, node);
                      add(parentNode, reference, resolvedNode);
                      break;
                    }

                    default:
                      throw new Error();
                  }
                }
              } else {
                add(path.node, reference, node);
              }
            } else {
              add(path.node, reference, node);
              suppressTag = true;
            }
          }
        }

        reference = null;
        held = isGap ? null : held;

        path = { parent: path, node, depth: (path.depth || -1) + 1, arrays: new Set() };

        break;
      }

      case ShiftTag: {
        const { children, properties } = path.node;

        let property = properties[ref.value.name];
        let node;

        if (ref.value.isArray) {
          ({ node } = btree.getAt(-1, property));
          properties[ref.value.name].pop();
        } else {
          ({ node } = property);
          properties[ref.value.name] = null;
        }

        held = node;
        break;
      }

      case OpenNodeTag: {
        const { flags } = tag.value;

        const node = createNode(tag);

        if (path) {
          add(path.node, reference, node);
          reference = null;
        }

        path = { parent: path, node, depth: (path ? path.depth : -1) + 1, arrays: new Set() };

        if (!path.depth) {
          rootPath = path;
        }

        break;
      }

      case OpenFragmentTag: {
        const { flags } = tag.value;

        const { attributes } = doctype.value;
        const language = attributes['bablr-language'];

        const node = {
          flags,
          language,
          type: null,
          children: [],
          properties: {},
          attributes,
        };

        if (path) throw new Error();

        path = { parent: null, node, depth: 0, arrays: new Set() };

        rootPath = path;

        break;
      }

      default: {
        throw new Error();
      }
    }

    if (!suppressTag) {
      path.node.children = btree.push(path.node.children, tag);
    }

    switch (tag.type) {
      case NullTag:
      case GapTag:
      case CloseNodeTag: {
        const completedNode = path.node;

        if (tag.type === GapTag) {
          if (path && completedNode.type === null && completedNode.flags.token) {
            break;
          }
        }

        finalizeNode(completedNode);

        path = path.parent;
        break;
      }
    }
  }

  if (path && path.node.type) {
    throw new Error('imbalanced tag stack');
  }

  return rootPath.node;
}

export const treeFromStream = (tags, options = {}) => __treeFromStream(tags, options);

export const treeFromStreamSync = (tokens, options = {}) => {
  return evaluateReturnSync(treeFromStream(tokens, options));
};

export const treeFromStreamAsync = async (tokens, options = {}) => {
  return evaluateReturnAsync(treeFromStream(tokens, options));
};

export const evaluateReturnSync = (generator) => {
  const co = new Coroutine(generator[Symbol.iterator]());
  while (!co.done) co.advance();
  return co.value;
};

export const evaluateReturnAsync = async (generator) => {
  const co = new Coroutine(getStreamIterator(generator));
  while (!co.done) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }
  }
  return co.value;
};

export const streamFromTree = (rootNode) => __streamFromTree(rootNode);

export const isEmpty = (node) => {
  const { properties } = node;

  let ref = null;

  for (const tag of btree.traverse(node.children)) {
    switch (tag.type) {
      case ReferenceTag: {
        const { name } = tag.value;

        ref = tag;

        if (properties[name]) {
          const property = properties[name];

          if (
            property != null ||
            (isArray(property) && property.length) ||
            property.node.type !== sym.null
          ) {
            return false;
          }
        }
        break;
      }

      case EmbeddedNode: {
        if (ref.value.name === '@') {
          return false;
        }
        break;
      }

      case LiteralTag:
      case GapTag:
        return false;
    }
  }
  return true;
};

const symbolTypeFor = (type) => {
  // prettier-ignore
  switch (type) {
    case NullTag: return sym.null;
    case GapTag: return sym.gap;
    default: throw new Error();
  }
};

export const buildStubNode = (tag) => {
  return freeze({
    flags: nodeFlags,
    language: null,
    type: symbolTypeFor(tag.type),
    children: freeze([tag]),
    properties: freeze({}),
    attributes: freeze({}),
  });
};

function* __streamFromTree(rootNode) {
  if (!rootNode || !btree.getSum(rootNode.children)) return;

  let tagPath = new TagPath(Path.from(rootNode), 0);

  do {
    yield tagPath.tag;
  } while ((tagPath = tagPath.next));
}

export const getCooked = (cookable) => {
  if (!cookable || cookable.type === sym.gap) {
    return '';
  }

  const children = cookable.children || cookable;

  let cooked = '';

  // const openTag = getOpenTag(cookable);
  // const closeTag = getCloseTag(cookable);

  let reference = null;

  for (const tag of btree.traverse(children)) {
    switch (tag.type) {
      case ReferenceTag: {
        const { name } = tag.value;

        if (!(name === '#' || name === '@')) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        reference = tag;
        break;
      }

      case EmbeddedNode: {
        const { attributes } = tag.value;

        if (reference.value.name === '@') {
          const { cooked: cookedValue } = attributes;

          if (!cookedValue && isString(cookedValue))
            throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case LiteralTag: {
        cooked += tag.value;
        break;
      }

      case OpenNodeTag: {
        break;
      }

      case CloseNodeTag: {
        break;
      }

      default: {
        throw new Error();
      }
    }
  }

  return cooked;
};

export const printCSTML = (rootNode) => {
  return printCSTMLFromStream(streamFromTree(rootNode));
};

export const printPrettyCSTML = (rootNode, options = {}) => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), options);
};

export const printSource = (rootNode) => {
  return printSourceFromStream(streamFromTree(rootNode));
};

export const sourceTextFor = printSource;

export const getOpenTag = (node) => {
  let tag = btree.getAt(0, node.children);
  if (tag.type === NullTag) return null;
  if (tag.type === DoctypeTag) {
    tag = btree.getAt(1, node.children);
  }
  if (tag && tag.type !== OpenNodeTag && tag.type !== OpenFragmentTag) throw new Error();
  return tag;
};

export const getCloseTag = (node) => {
  const { children } = node;
  const tag = btree.getAt(-1, children);
  if (tag.type !== CloseNodeTag) return null;
  return tag;
};

export const getRange = (node) => {
  const { children } = node;
  return btree.getSum(children) ? [btree.getAt(0, children), btree.getAt(-1, children)] : null;
};

export const createNode = (openTag) => {
  if (openTag.type === GapTag || openTag.type === NullTag) {
    return {
      flags: nodeFlags,
      language: null,
      type: symbolTypeFor(openTag.type),
      children: [],
      properties: {},
      attributes: {},
    };
  } else {
    const { flags, language, type, attributes } = openTag.value || {};
    return { flags, language, type, children: [], properties: {}, attributes };
  }
};

export const finalizeNode = (node) => {
  for (const property of Object.values(node.properties)) {
    if (isArray(property)) {
      btree.freeze(property);
      for (const childProperty of btree.traverse(property)) {
        freeze(childProperty);
      }
    } else {
      freeze(property);
    }
  }

  freeze(node);
  btree.freeze(node.children);
  freeze(node.properties);
  freeze(node.attributes);
  return node;
};

export const notNull = (node) => {
  return node != null && node.type !== sym.null;
};

export const isNull = (node) => {
  return node == null || node.type === sym.null;
};

export const branchProperties = (properties) => {
  const copy = { ...properties };

  for (const { 0: key, 1: value } of Object.entries(copy)) {
    if (isArray(value)) {
      copy[key] = btree.fromValues(value);
    }
  }

  return copy;
};

export const branchNode = (node) => {
  const { flags, language, type, children, properties, attributes } = node;
  return {
    flags,
    language,
    type,
    // if we always use immutable trees we won't need to do this
    children: btree.fromValues(btree.traverse(children)),
    properties: branchProperties(properties),
    attributes: { ...attributes },
  };
};

export const acceptNode = (node, accepted) => {
  const { children, properties, attributes } = accepted;
  node.children = children;
  node.properties = properties;
  node.attributes = attributes;
  return node;
};

export const getRoot = (node) => {
  return node == null ? node : node.type == null ? node.properties['.'].node : node;
};

export function* traverseProperties(properties) {
  for (const value of Object.values(properties)) {
    if (isArray(value)) {
      yield* btree.traverse(value);
    } else {
      yield value;
    }
  }
}

export class Resolver {
  constructor(
    states = emptyStack.push({ properties: new Map(), idx: 0 }),
    reference = null,
    popped = false,
    held = null,
  ) {
    this.states = states;
    this.reference = reference;
    this.popped = popped;
    this.held = held;
    this.doctype = null;
  }

  get idx() {
    return this.states.value.idx;
  }

  get properties() {
    return this.states.value.properties;
  }

  advance(tag) {
    const { states } = this;

    ++states.value.idx;

    this.popped = false;

    let hadReference = this.reference;

    switch (tag.type) {
      case ReferenceTag: {
        const { name, isArray } = tag.value;
        const { properties } = states.value;

        if (this.reference) throw new Error();

        this.reference = tag;

        if (name && name !== '#' && name !== '@') {
          let state = properties.get(name);

          if (isArray) {
            if (state && !state.isArray) throw new Error();

            const { count = -1 } = state || {};

            state = { count: count + 1, isArray };
          } else if (state) {
            throw new Error(`attempted to consume property {name: ${name}} twice`);
          } else {
            state = { count: 1, isArray: false };
          }

          properties.set(name, state);
        }

        break;
      }

      case EmbeddedNode: {
        if (!this.reference) throw new Error();

        // this.states = states.push({ properties: new Map(), idx: 0 });
        break;
      }

      case OpenNodeTag:
      case OpenFragmentTag: {
        const { reference } = this;
        const { flags } = tag.value;
        const isRootNode = states.size === 1;

        if (tag.type !== OpenFragmentTag) {
          this.states = states.push({ properties: new Map(), idx: 0 });
        }

        if (tag.type === OpenFragmentTag && (!isRootNode || this.reference)) throw new Error();

        if (
          tag.type === OpenNodeTag &&
          ((!reference && !isRootNode) ||
            (reference &&
              reference.type !== ReferenceTag &&
              reference.type !== ShiftTag &&
              reference.type !== OpenNodeTag))
        ) {
          throw new Error('Invalid location for OpenNodeTag');
        }

        if (!isRootNode && !reference) {
          throw new Error();
        }

        this.reference = null;
        break;
      }

      case ArrayInitializerTag: {
        if (!this.reference) throw new Error();

        const { name } = this.reference.value;
        const { properties } = states.value;
        const state = properties.get(name);

        if (!state || !state.isArray || state.count !== 0) throw new Error();

        properties.set(name, { count: 0, isArray: true });

        this.reference = null;
        break;
      }

      case ShiftTag: {
        this.held = this.states.value;
        this.states = this.states.push({ properties: new Map(), idx: 0 });
        this.reference = tag;

        break;
      }

      case NullTag: {
        this.popped = true;
        this.reference = null;
        break;
      }

      case GapTag: {
        if (this.held) {
          // this.states = this.states.push(this.held);
          this.held = null;
        }

        this.popped = true;
        this.reference = null;
        break;
      }

      case CloseNodeTag:
      case CloseFragmentTag: {
        this.states = states.pop();
        this.popped = true;
        break;
      }

      case DoctypeTag:
        this.doctype = tag;
        break;

      case LiteralTag:
        break;

      default:
        throw new Error();
    }

    if (hadReference && this.reference && tag.type !== EmbeddedNode) throw new Error();

    return this;
  }

  resolve(reference) {
    let { name, isArray, flags } = reference.value;
    const { states } = this;
    const state = states.value.properties.get(name);
    let index = null;

    if (name === '@' || name === '#') return reference;

    if (isArray && state) {
      index = state?.count || 0;
    }

    return buildReferenceTag(name, isArray, flags, index);
  }

  branch() {
    const { states, reference, popped, held } = this;
    const { properties, idx } = states.value;

    return new Resolver(
      states.replace({ properties: new Map(properties), idx }),
      reference,
      popped,
      held,
    );
  }

  accept(resolver) {
    this.states = resolver.states;
    this.reference = resolver.reference;
    this.popped = resolver.popped;
    this.held = resolver.held;

    return this;
  }
}

freeze(Resolver.prototype);
