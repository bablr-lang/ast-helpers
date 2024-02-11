import emptyStack from '@iter-tools/imm-stack';
import { buildNode, buildReference } from './builders.js';
import { printTerminal } from './print.js';
import { streamFromTree } from './stream.js';
export * from './builders.js';
export * from './print.js';

const { hasOwn, freeze } = Object;

export const reduceToken = (nodes, token) => {
  switch (token.type) {
    case 'OpenNodeTag': {
      const {
        path,
        tag: { flags, language, type, attributes },
      } = token.value;
      const node = nodes.value;

      const newNode = buildNode(flags, language, type, [], {}, attributes);

      if (node) {
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

export const getCooked = (node) => {
  if (!node || node.type === 'Gap') {
    return '';
  }

  let cooked = '';
  let childrenIdx = 0;

  for (const terminal of node.children) {
    switch (terminal.type) {
      case 'Reference': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'Gap': {
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
    childrenIdx++;
  }
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
