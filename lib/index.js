const { freeze } = Object;

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
