import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { nodeFlags, buildEmbeddedNode } from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  getStreamIterator,
  StreamIterable,
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
  ArrayTag,
  LiteralTag,
  EmbeddedNode,
} from './symbols.js';
import * as btree from './btree.js';
import * as sym from './symbols.js';
export * from './builders.js';
export * from './print.js';

const arrayLast = (arr) => arr[arr.length - 1];

const isString = (str) => typeof str === 'string';

const { isArray } = Array;

const { hasOwn, freeze } = Object;

export const get = (node, path) => {
  const { properties } = node;
  const { 1: name, 2: index } = /^([^\.]+|\.)(?:\.(\d+))?/.exec(path) || [];

  if (!hasOwn(properties, name)) {
    return null;
  }

  if (index != null) {
    return btree.getAt(parseInt(index, 10), properties[name]);
  } else {
    return properties[name];
  }
};

export const add = (node, ref, value) => {
  const { name, isArray } = ref.value;

  if (isArray) {
    if (!hasOwn(node.properties, name)) {
      node.properties[name] = [];
    }

    node.properties[name] = btree.push(node.properties[name], value);
  } else {
    node.properties[name] = value;
  }
};

function* __treeFromStream(tokens) {
  let path = null;
  let rootPath = null;
  let held = null;
  let doctype = null;
  const co = new Coroutine(getStreamIterator(tokens));

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

    switch (tag.type) {
      case LiteralTag:
      case ReferenceTag:
      case CloseNodeTag:
      case CloseFragmentTag: {
        break;
      }

      case NullTag:
      case GapTag: {
        const parentNode = path.parent.node;
        const ref = arrayLast(parentNode.children);
        const isGap = tag.type === GapTag;

        if (ref.type !== ReferenceTag) throw new Error();

        const node = (isGap && held) || createNode(nodeFlags, null, sym.null);

        held = isGap ? null : held;
        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        add(parentNode, ref, node);
        break;
      }

      case ShiftTag: {
        const { children, properties } = path.node;

        const ref = arrayLast(children);
        let node = properties[ref.value.name];

        if (ref.value.isArray) {
          node = arrayLast(node);
          properties[ref.value.name].pop();
        } else {
          properties[ref.value.name] = null;
        }

        held = node;
        break;
      }

      case OpenNodeTag: {
        const { flags, type, language, attributes } = tag.value;

        const node = createNode(flags, language, type, [], {}, attributes);

        const parentPath = path;

        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        if (!parentPath) throw new Error();

        const { node: parentNode } = path;
        if (!(flags.escape || flags.trivia)) {
          if (!parentNode.children.length) {
            throw new Error('Nodes must follow references');
          }

          const ref = arrayLast(parentNode.children);

          add(parentNode, ref, node);
        } else {
          parentNode.children.push(buildEmbeddedNode(node));
        }

        break;
      }

      case OpenFragmentTag: {
        const { flags } = tag.value;

        const language = doctype.value.attributes['bablr-language'];
        const attributes = doctype.value.attributes;

        const node = freeze({
          flags,
          language,
          type: null,
          children: [],
          properties: {},
          attributes,
        });

        if (path) throw new Error();

        path = { parent: null, node, depth: 0 };

        rootPath = path;

        break;
      }

      default: {
        throw new Error();
      }
    }

    path.node.children.push(tag);

    switch (tag.type) {
      case NullTag:
      case GapTag:
      case CloseNodeTag: {
        const completedNode = path.node;

        finalizeNode(completedNode);

        if (!completedNode.type && path.depth !== 1) {
          throw new Error('imbalanced tag stack');
        }

        path = path.parent;
        break;
      }
    }
  }

  return rootPath.node;
}

export const treeFromStream = (tags) => __treeFromStream(tags);

export const treeFromStreamSync = (tokens) => {
  return evaluateReturnSync(treeFromStream(tokens));
};

export const treeFromStreamAsync = async (tokens) => {
  return evaluateReturnAsync(treeFromStream(tokens));
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

  for (const child of btree.traverse(node.children)) {
    switch (child.type) {
      case ReferenceTag: {
        const { name } = child.value;

        if (properties[name]) {
          const value = properties[name];

          if (value != null || value.type !== sym.null || (isArray(value) && value.length)) {
            return false;
          }
        }
        break;
      }

      case EmbeddedNode: {
        if (node.value.flags.escape) {
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
  if (!rootNode || rootNode.type === GapTag) {
    return rootNode;
  }

  let stack = emptyStack.push(rootNode);
  const resolver = new Resolver();

  stack: while (stack.size) {
    const node = stack.value;
    const { children } = node;

    while (true) {
      const tag = btree.getAt(resolver.idx, children);

      if (isArray(tag)) {
        throw new Error();
      }

      switch (tag.type) {
        case EmbeddedNode: {
          stack = stack.push(tag.value);

          resolver.advance(tag);

          continue stack;
        }

        case ReferenceTag: {
          const resolvedPath = resolver.resolve(tag);
          const resolved = get(stack.value, resolvedPath);
          const { isArray: refIsArray } = tag.value;

          if (!resolved) throw new Error();

          yield tag;

          resolver.advance(tag);

          if (!refIsArray || !isArray(resolved)) {
            if (isArray(resolved)) throw new Error();
            stack = stack.push(resolved);
          }
          continue stack;
        }

        case GapTag:
        case NullTag:
        case CloseNodeTag:
        case CloseFragmentTag: {
          stack = stack.pop();
          resolver.advance(tag);
          yield tag;
          continue stack;
        }

        default:
          resolver.advance(tag);
          yield tag;
          break;
      }
    }
  }
}

export const getCooked = (cookable) => {
  if (!cookable || cookable.type === GapTag) {
    return '';
  }

  const children = cookable.children || cookable;

  let cooked = '';

  const openTag = getOpenTag(cookable);
  const closeTag = getCloseTag(cookable);

  for (const tag of btree.traverse(children)) {
    switch (tag.type) {
      case ReferenceTag: {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case EmbeddedNode: {
        const { flags, attributes } = tag.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (flags.escape) {
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

const __printSource = (rootNode, resolver = new Resolver()) => {
  let printed = '';

  if (!rootNode) return '';

  let node = rootNode;

  if (node instanceof Promise) {
    printed += '$Promise';
  } else {
    for (const child of btree.traverse(node.children)) {
      if (child.type === LiteralTag) {
        printed += child.value;
        resolver.advance(child);
      } else if (child.type === EmbeddedNode) {
        resolver.advance(child);
        printed += __printSource(child.value, resolver);
      } else if (child.type === ReferenceTag) {
        const resolvedPath = resolver.resolve(child);
        const resolvedNode = get(node, resolvedPath);

        resolver.advance(child);
        if (resolvedNode) {
          if (!isArray(resolvedNode)) {
            printed += __printSource(resolvedNode, resolver);
          }
        }
      } else {
        resolver.advance(child);
      }
    }
  }

  return printed;
};

export const printSource = (rootNode) => __printSource(rootNode);

export const sourceTextFor = printSource;

export const getOpenTag = (node) => {
  const tag = btree.getAt(node.type ? 0 : 1, node.children);
  if (tag.type === NullTag) return null;
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
  return children.length ? [children[1], children[children.length - 1]] : null;
};

export const createNode = (openTag) => {
  const { flags, language, type, attributes } = openTag.value;
  return { flags, language, type, children: [], properties: {}, attributes };
};

export const finalizeNode = (node) => {
  for (const propertyValue of Object.values(node.properties)) {
    if (isArray(propertyValue)) {
      btree.freeze(propertyValue);
    }
  }

  freeze(node);
  btree.freeze(node.children);
  freeze(node.properties);
  freeze(node.attributes);
  return node;
};

export const notNull = (node) => {
  return node && node.type !== sym.null;
};

export const isNull = (node) => {
  return !node || node.type === sym.null;
};

export const branchProperties = (properties) => {
  const copy = { ...properties };

  for (const { 0: key, 1: value } of Object.entries(copy)) {
    if (isArray(value)) {
      copy[key] = [...value];
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
    children: [...children],
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
  return node.type == null ? node.properties['.'] : node;
};

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

    switch (tag.type) {
      case ReferenceTag: {
        const { name, isArray } = tag.value;
        const { properties } = states.value;

        if (this.reference) throw new Error();

        this.reference = tag;

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

        if (!isArray || state.count > 0) {
          this.states = states.push({ properties: new Map(), idx: 0 });
        }

        break;
      }

      case EmbeddedNode: {
        if (this.reference) throw new Error();

        this.reference = tag;

        this.states = states.push({ properties: new Map(), idx: 0 });
        break;
      }

      case OpenNodeTag:
      case OpenFragmentTag: {
        const { flags } = tag.value;
        const isRootNode = states.size === 1;

        if (tag.type === OpenFragmentTag && (!isRootNode || this.reference)) throw new Error();

        if (flags.trivia || flags.escape) {
          if (this.reference?.type === ReferenceTag)
            throw new Error('embedded nodes cannot follow references');
          if (this.reference?.type !== EmbeddedNode) {
            this.states = states.push({ properties: new Map(), idx: 0 });
          }
        } else {
          if (!isRootNode && !this.reference) {
            throw new Error();
          }
        }

        this.reference = null;
        break;
      }

      case ArrayTag: {
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
        this.states = states.pop();
        this.popped = true;
        this.reference = null;
        break;
      }

      case GapTag: {
        this.states = states.pop();

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

    return this;
  }

  resolve(reference) {
    let { name, isArray } = reference.value;
    const { states } = this;
    const state = states.value.properties.get(name);
    let path = name;

    if (isArray) {
      if (state) {
        const count = state?.count || 0;
        path += '.' + count;
      }
    }

    return path;
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
