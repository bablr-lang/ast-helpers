import emptyStack from '@iter-tools/imm-stack';
import {
  buildNodeWithFlags,
  buildFragmentCloseTag,
  buildNodeCloseTag,
  buildNodeOpenTag,
  buildReference,
  buildEmbedded,
} from './builders.js';
import { printTerminal } from './stream.js';
export * from './builders.js';
export * from './print.js';

const buildFrame = (node) => {
  return { node, childrenIdx: 0, resolver: new Resolver(node) };
};

const { hasOwn, freeze } = Object;

const get = (node, path) => {
  const { 1: pathName, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (index != null) {
    return node.properties[pathName][parseInt(index, 10)];
  } else {
    return node.properties[pathName];
  }
};

export const reduceToken = (nodes, token) => {
  switch (token.type) {
    case 'OpenNodeTag': {
      const {
        path,
        tag: { flags, language, type, attributes },
      } = token.value;
      const node = nodes.value;
      const newNode = buildNodeWithFlags(flags, language, type, [], {}, attributes);

      if (node && !(flags.escape || flags.trivia)) {
        const { pathName, pathIsArray } = path;

        node.children.push(buildReference(pathName, pathIsArray));

        if (pathIsArray) {
          if (!hasOwn(node.properties(pathName))) {
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
        const parentChildren = nodes.parent.value.children;

        parentChildren.push(buildEmbedded(completedNode));
      }

      freeze(completedNode.properties);
      freeze(completedNode.children);
      freeze(completedNode.attributes);

      return nodes.pop();
    }

    default: {
      nodes.value.children.push(token);

      return nodes;
    }
  }
};

export const treeFromStreamSync = (tokens) => {
  let nodes = emptyStack;

  for (const token of tokens) {
    nodes = reduceToken(nodes, token);
  }
};

export const treeFromStreamAsync = async (tokens) => {
  let nodes = emptyStack;

  for await (const token of tokens) {
    nodes = reduceToken(nodes, token);
  }
};

export function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'Gap') {
    return rootNode;
  }

  let stack = emptyStack.push({
    node: rootNode,
    childrenIdx: 0,
    resolver: new Resolver(rootNode),
  });

  while (stack.size) {
    const { node } = stack.value;
    const { type, attributes, flags } = stack.value.node;

    if (node.type) {
      yield buildNodeOpenTag(flags, type, attributes);
    } else {
      yield buildFragmentCloseTag(flags);
    }

    while (stack.value.childrenIdx < node.children.length) {
      const terminal = node.children[stack.value.childrenIdx];

      stack.value.childrenIdx++;

      switch (terminal.type) {
        case 'Literal':
        case 'Gap': {
          yield terminal;
          break;
        }

        case 'Embedded': {
          stack = stack.push(buildFrame(terminal.value));
          break;
        }

        case 'Reference': {
          stack = stack.push(buildFrame(stack.value.resolver.consume(terminal).get(terminal)));

          yield terminal;
          break;
        }

        default: {
          throw new Error();
        }
      }
    }

    if (node.type) {
      yield buildNodeCloseTag();
    } else {
      yield buildFragmentCloseTag();
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

      case 'Escape': {
        const { flags, attributes } = terminal.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (!flags.trivia) {
          cooked += terminal.value.attributes.cooked;
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
  let str = '';
  for (const token of streamFromTree(rootNode)) {
    str += printTerminal(token);
  }
  return str;
};

export const printPrettyCSTML = (rootNode, indent = '  ') => {
  let printed = '';
  let indentLevel = 0;
  for (const token of streamFromTree(rootNode)) {
    printed += indent.repeat(indentLevel + 1);
    printed += printTerminal(token);

    if (token.type === 'StartNode') {
      indentLevel++;
    } else if (token.type === 'EndNode') {
      indentLevel--;
    }
    printed += '\n';
  }
  return printed;
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
      printed += printSource(resolver.get(child));
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
      const count = counters.get(pathName) || 0;

      counters.set(pathName, count + 1);
    } else {
      if (counters.get(pathName) >= 1) throw new Error('attempted to consume property twice');

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
