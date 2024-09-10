import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { buildNull, nodeFlags, buildDoctypeTag, buildEmbeddedNode } from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  getStreamIterator,
  StreamIterable,
} from './stream.js';
import * as sym from './symbols.js';
export * from './builders.js';
export * from './print.js';

const arrayLast = (arr) => arr[arr.length - 1];

const isString = (str) => typeof str === 'string';

const { isArray } = Array;

const buildFrame = (node) => {
  if (!node) throw new Error();
  return { node, childrenIdx: -1, resolver: new Resolver(node) };
};

const { hasOwn, freeze } = Object;

export const get = (node, path) => {
  const { type, properties } = node;
  const { 1: name, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (!hasOwn(properties, name)) {
    throw new Error(`Cannot find {name: ${name}} on node of {type: ${type}}`);
  }

  if (index != null) {
    return properties[name]?.[parseInt(index, 10)];
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
    const array = node.properties[name];

    array.push(value);
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

    const token = co.value;

    if (token.type === 'Effect') {
      continue;
    }

    if (token.type === 'DoctypeTag') {
      doctype = token;
      continue;
    }

    if (held && token.type !== 'StartNodeTag' && token.type !== 'GapTag') {
      throw new Error('cannot eat this type of tag while holding');
    }

    switch (token.type) {
      case 'LiteralTag':
      case 'ReferenceTag':
      case 'CloseNodeTag': {
        break;
      }

      case 'NullTag':
      case 'GapTag': {
        const parentNode = path.parent.node;
        const ref = arrayLast(parentNode.children);
        const isGap = token.type === 'Gap';

        if (ref.type !== 'Reference') throw new Error();

        const node = (isGap && held) || createNode(nodeFlags, null, sym.null);

        held = isGap ? null : held;
        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        add(parentNode, ref, node);
        break;
      }

      case 'ShiftTag': {
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

      case 'OpenNodeTag': {
        const { flags, type } = token.value;

        const language = type ? token.value.language : doctype.value.attributes['bablr-language'];
        const attributes = type ? token.value.attributes : doctype.value.attributes;

        const node = createNode(flags, language, type, [], {}, attributes);

        const parentPath = path;

        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        if (parentPath) {
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
        } else {
          rootPath = path;
        }

        break;
      }

      default: {
        throw new Error();
      }
    }

    path.node.children.push(token);

    switch (token.type) {
      case 'NullTag':
      case 'GapTag':
      case 'CloseNodeTag': {
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

export const treeFromStream = (terminals) => new StreamIterable(__treeFromStream(terminals));

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

function* __streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'GapTag') {
    return rootNode;
  }

  yield buildDoctypeTag(rootNode.attributes);

  let stack = emptyStack.push(buildFrame(rootNode));

  stack: while (stack.size) {
    const frame = stack.value;
    const { node, resolver } = frame;
    const { children } = node;

    while (++frame.childrenIdx < children.length) {
      const tag = children[frame.childrenIdx];

      switch (tag.type) {
        case 'EmbeddedNode': {
          stack = stack.push(buildFrame(tag.value));

          break;
        }

        case 'ReferenceTag': {
          const resolved = resolver.consume(tag).get(tag);

          yield tag;

          if (tag.value.isArray && !resolved) {
            // TODO evaluate if this is still smart
            yield buildNull();
          } else {
            if (!resolved) throw new Error();

            stack = stack.push(buildFrame(resolved));
          }

          break;
        }

        case 'NullTag': {
          yield tag;

          break;
        }

        default:
          yield tag;
      }

      if (tag.type === 'EmbeddedNode' || tag.type === 'ReferenceTag') {
        continue stack;
      }
    }

    stack = stack.pop();
  }
}

export const getCooked = (cookable) => {
  if (!cookable || cookable.type === 'Gap') {
    return '';
  }

  const children = cookable.children || cookable;

  let cooked = '';

  for (const tag of children) {
    switch (tag.type) {
      case 'ReferenceTag': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'EmbeddedNode': {
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

      case 'LiteralTag': {
        cooked += tag.value;
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

export const printSource = (node) => {
  const resolver = new Resolver(node);
  let printed = '';

  if (!node) return '';

  if (node instanceof Promise) {
    printed += '$Promise';
  } else {
    for (const child of node.children) {
      if (child.type === 'LiteralTag') {
        printed += child.value;
      } else if (child.type === 'EmbeddedNode') {
        printed += printSource(child.value);
      } else if (child.type === 'ReferenceTag') {
        const node_ = resolver.consume(child).get(child);

        if (node_) {
          printed += printSource(node_);
        }
      }
    }
  }

  return printed;
};

export const sourceTextFor = printSource;

export const getOpenTag = (node) => {
  const tag = node.children[0];
  if (tag && tag.type !== 'OpenNodeTag') throw new Error();
  return tag;
};

export const getCloseTag = (node) => {
  const { children } = node;
  const tag = children[children.length - 1];
  if (tag.type !== 'CloseNodeTag') return null;
  return tag;
};

export const getRange = (node) => {
  const { children } = node;
  return children.length ? [children[0], children[children.length - 1]] : null;
};

export const createNode = (openTag) => {
  const { flags, language, type, attributes } = openTag.value;
  return { flags, language, type, children: [], properties: {}, attributes };
};

export const finalizeNode = (node) => {
  freeze(node);
  freeze(node.children);
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

export const getRoot = (fragmentNode) => {
  if (!fragmentNode) return null;

  for (const tag of fragmentNode.children) {
    if (tag.type === 'ReferenceTag') {
      if (tag.value.isArray) throw new Error();
      return fragmentNode.properties[tag.value.name];
    }
  }
};

export class Resolver {
  constructor(node, counters = new Map()) {
    this.node = node;
    this.counters = counters;
  }

  consume(reference) {
    const { name, isArray } = reference.value;
    const { counters } = this;

    if (isArray) {
      const count = counters.get(name) + 1 || 0;

      counters.set(name, count);
    } else {
      if (counters.has(name))
        throw new Error(`attempted to consume property {name: ${name}} twice`);

      counters.set(name, 1);
    }

    return this;
  }

  resolve(reference) {
    let { name, isArray } = reference.value;
    const { counters } = this;
    let path = name;

    if (isArray) {
      const count = counters.get(name) || 0;

      path += '.' + count;
    }

    return path;
  }

  get(reference) {
    if (!this.node) throw new Error('Cannot get from a resolver with no node');

    return get(this.node, this.resolve(reference));
  }

  branch() {
    return new Resolver(this.node, new Map(this.counters));
  }

  accept(resolver) {
    this.counters = resolver.counters;

    return this;
  }
}

freeze(Resolver.prototype);
