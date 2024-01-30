import emptyStack from '@iter-tools/imm-stack';

const { hasOwn, freeze } = Object;

export const getCooked = (token) => {
  return token.children
    .map((child) => {
      if (child.type === 'Escape') {
        return child.value.cooked;
      } else if (child.type === 'Literal') {
        return child.value;
      } else throw new Error();
    })
    .join('');
};

export const getRaw = (token) => {
  return token.children
    .map((child) => {
      if (child.type === 'Escape') {
        return child.value.raw;
      } else if (child.type === 'Literal') {
        return child.value;
      } else throw new Error();
    })
    .join('');
};

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

export const buildReferenceTag = (pathName, pathIsArray) => {
  return freeze({ type: 'ReferenceTag', value: freeze({ pathName, pathIsArray }) });
};

export const buildNodeOpenTag = (type, attributes = {}) => {
  return freeze({ type: 'OpenNodeTag', value: freeze({ type, attributes }) });
};

export const buildFragmentOpenTag = () => {
  return freeze({ type: 'OpenFragmentTag', value: undefined });
};

export const buildNodeCloseTag = (type) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ type }) });
};

function reduceToken(nodes, token) {
  switch (token.type) {
    case 'OpenNodeTag': {
      const {
        path,
        tag: { language, type, attributes },
      } = token.value;
      const node = nodes.value;

      const newNode = freeze({ language, type, children: [], properties: {}, attributes });

      if (node) {
        node.children.push({ type: 'ReferenceTag', value: path });

        const { pathName, pathIsArray } = path;

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
