import emptyStack from '@iter-tools/imm-stack';
import { buildNode, buildReference } from './builders.js';
export * from './builders.js';

const { hasOwn, freeze } = Object;

export const parsePath = (str) => {
  const pathIsArray = str.endsWith('[]');
  const pathName = pathIsArray ? str.slice(0, -2) : str;

  if (!/^\w+$/.test(pathName)) throw new Error();

  return { pathIsArray, pathName };
};

export const printPath = (path) => {
  if (!path) return null;

  const { pathIsArray, pathName } = path;

  return `${pathName}${pathIsArray ? '[]' : ''}`;
};

function reduceToken(nodes, token) {
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
}

export function treeFromTokensSync(tokens) {
  let nodes = emptyStack;

  for (const token of tokens) {
    nodes = reduceToken(nodes, token);
  }
}

export async function treeFromTokensAsync(tokens) {
  let nodes = emptyStack;

  for await (const token of tokens) {
    nodes = reduceToken(nodes, token);
  }
}
