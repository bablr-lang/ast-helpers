export const parsePath = (str) => {
  let name = str;
  const hasGap = name.endsWith('$');

  if (hasGap) name = name.slice(0, -1);

  const isArray = name.endsWith('[]');

  if (isArray) name = name.slice(0, -2);

  if (!/^(\.|[a-zA-Z]+)$/.test(name)) throw new Error();

  const isRoot = name === '.';

  return { name, hasGap, isArray, isRoot };
};

export const printPath = (path) => {
  if (!path) return null;

  const { isArray, isRoot, hasGap, name } = path;

  if (isRoot && name !== '.') throw new Error();

  return `${name}${isArray ? '[]' : ''}${hasGap ? '$' : ''}`;
};
