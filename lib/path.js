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
