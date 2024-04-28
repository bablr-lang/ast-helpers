export const parsePath = (str) => {
  const isArray = str.endsWith('[]');
  const name = isArray ? str.slice(0, -2) : str;

  if (!/^\w+$/.test(name)) throw new Error();

  return { isArray, name };
};

export const printPath = (path) => {
  if (!path) return null;

  const { isArray, name } = path;

  return `${name}${isArray ? '[]' : ''}`;
};
