const { isArray } = Array;
const { hasOwn } = Object;

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

export class PathResolver {
  constructor(node) {
    this.node = node;
    this.counters = {};
  }

  get(path) {
    const { node, counters } = this;

    const { pathIsArray, pathName } = path;

    if (!hasOwn(node.properties, pathName)) {
      throw new Error(`cannot resolve {path: ${pathName}}`);
    }

    let value = node.properties[pathName];

    if (pathIsArray) {
      if (!isArray(value)) {
        throw new Error(`cannot resolve {path: ${pathName}}: not an array`);
      }

      const counter = counters[pathName] ?? 0;

      counters[pathName] = counter + 1;

      value = value[counter];
    }

    return value;
  }
}
