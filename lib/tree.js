import emptyStack from '@iter-tools/imm-stack';
import {
  buildNodeCloseTag,
  buildNodeOpenTag,
  buildNull,
  buildEmbedded,
  nodeFlags,
  buildDoctypeTag,
  buildFragmentOpenTag,
  buildFragmentCloseTag,
  buildReference,
} from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
} from './stream.js';
export * from './builders.js';
export * from './print.js';

const arrayLast = (arr) => arr[arr.length - 1];

const buildFrame = (node) => {
  if (!node) throw new Error();
  return { node, childrenIdx: -1, resolver: new Resolver(node) };
};

const { hasOwn, freeze } = Object;

const get = (node, path) => {
  const { 1: pathName, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (index != null) {
    return node.properties[pathName]?.[parseInt(index, 10)];
  } else {
    return node.properties[pathName];
  }
};

const reduceToken = (nodes, token) => {
  switch (token.type) {
    case 'OpenFragmentTag':
    case 'CloseFragmentTag':
    case 'Null': {
      return nodes;
    }
    case 'DoctypeTag': {
      const { language, attributes } = token.value;
      return nodes.push(
        freeze({
          flags: nodeFlags,
          language,
          type: null,
          children: [],
          properties: {},
          attributes: freeze(attributes),
        }),
      );
    }

    case 'CloseFragmentTag': {
      if (nodes.size === 1) {
        freeze(nodes.value.properties);
        freeze(nodes.value.children);
      }
      return nodes;
    }

    case 'Literal':
    case 'Gap':
    case 'Reference': {
      nodes.value.children.push(token);
      return nodes;
    }

    case 'OpenNodeTag': {
      const { flags, language, type, attributes } = token.value;
      const node = nodes.value;
      const newNode = freeze({
        flags,
        language,
        type,
        children: [],
        properties: {},
        attributes: freeze(attributes),
      });

      if (node && !(flags.escape || flags.trivia)) {
        if (nodes.size === 1) {
          nodes.value.children.push(buildReference('root', false));
        }

        if (!nodes.value.children.length) {
          throw new Error('Nodes must follow references');
        }

        const { pathName, pathIsArray } = arrayLast(nodes.value.children).value;

        if (pathIsArray) {
          if (!hasOwn(node.properties, pathName)) {
            node.properties[pathName] = [];
          }
          const array = node.properties[pathName];

          array.push(newNode);
        } else {
          node.properties[pathName] = newNode;
        }
      }

      return nodes.push(newNode);
    }

    case 'CloseNodeTag': {
      const completedNode = nodes.value;
      const { flags } = completedNode;

      if (flags.escape || flags.trivia) {
        const parentChildren = nodes.prev.value.children;

        parentChildren.push(buildEmbedded(completedNode));
      }

      freeze(completedNode.properties);
      freeze(completedNode.children);

      return nodes.pop();
    }

    default: {
      throw new Error();
    }
  }
};

export const treeFromStreamSync = (tokens) => {
  let nodes = emptyStack;
  let rootNode;

  for (const token of tokens) {
    nodes = reduceToken(nodes, token);
    rootNode = nodes.value || rootNode;
  }

  return nodes.value;
};

export const treeFromStreamAsync = async (tokens) => {
  let nodes = emptyStack;
  let rootNode;

  for await (const token of tokens) {
    nodes = reduceToken(nodes, token);
    rootNode = nodes.value || rootNode;
  }

  return rootNode;
};

export function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'Gap') {
    return rootNode;
  }

  yield buildDoctypeTag(rootNode.language);

  let stack = emptyStack.push(buildFrame(rootNode));

  stack: while (stack.size) {
    const frame = stack.value;
    const { node, resolver } = frame;
    const { language, type, attributes, flags } = node;

    if (frame.childrenIdx === -1) {
      if (stack.size === 1) {
        yield buildFragmentOpenTag();
      } else {
        yield buildNodeOpenTag(flags, language, type, attributes);
      }
    }

    while (++frame.childrenIdx < node.children.length) {
      const terminal = node.children[frame.childrenIdx];

      switch (terminal.type) {
        case 'Literal':
        case 'Gap':
        case 'Null': {
          yield terminal;
          break;
        }

        case 'Embedded': {
          stack = stack.push(buildFrame(terminal.value));
          continue stack;
        }

        case 'Reference': {
          if (stack.size > 1) {
            yield terminal;
          }

          const resolved = resolver.consume(terminal).get(terminal);
          if (resolved) {
            stack = stack.push(buildFrame(resolved));
            continue stack;
          } else {
            yield buildNull();
            break;
          }
        }

        default: {
          throw new Error();
        }
      }
    }

    if (stack.size === 1) {
      yield buildFragmentCloseTag();
    } else {
      yield buildNodeCloseTag(node.type, node.language);
    }

    stack = stack.pop();
  }
}

export const getCooked = (node) => {
  if (!node || node.type === 'Gap') {
    return '';
  }

  let cooked = '';

  for (const terminal of node.children) {
    switch (terminal.type) {
      case 'Reference': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'Embedded': {
        const { flags, attributes } = terminal.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (!flags.trivia) {
          const { cooked: cookedValue } = attributes;

          if (!cookedValue) throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case 'Literal': {
        cooked += terminal.value;
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

export const printPrettyCSTML = (rootNode, indent = '  ') => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), indent);
};

export const printSource = (node) => {
  const resolver = new Resolver(node);
  let printed = '';

  for (const child of node.children) {
    if (child.type === 'Literal') {
      printed += child.value;
    } else if (child.type === 'Embedded') {
      printed += printSource(child.value);
    } else if (child.type === 'Reference') {
      const resolved = resolver.consume(child).get(child);
      if (resolved || !child.value.pathIsArray) {
        printed += printSource(resolved);
      }
    }
  }

  return printed;
};

export class Resolver {
  constructor(node, counters = new Map()) {
    this.node = node;
    this.counters = counters;
  }

  consume(reference) {
    const { pathName, pathIsArray } = reference.value;
    const { counters } = this;

    if (pathIsArray) {
      const count = counters.get(pathName) + 1 || 0;

      counters.set(pathName, count);
    } else {
      if (counters.has(pathName)) throw new Error('attempted to consume property twice');

      counters.set(pathName, 1);
    }

    return this;
  }

  resolve(reference) {
    let { pathName, pathIsArray } = reference.value;
    const { counters } = this;
    let path = pathName;

    if (pathIsArray) {
      const count = counters.get(pathName) || 0;

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
