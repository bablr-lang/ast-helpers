import * as t from './builders.js';

const { isArray } = Array;

const spreads = new WeakMap();

export const spread = (arg) => {
  const wrapper = { value: arg };
  spreads.set(wrapper, true);
  return wrapper;
};

export const interpolateArray = (values, buildSeparator) => {
  const children = [];
  for (const value of values) {
    if (spreads.has(value)) {
      let first = true;

      for (const element of value.value) {
        if (!first && buildSeparator) {
          children.push(buildSeparator());
        }

        children.push(element);

        first = false;
      }
    } else {
      children.push(value);
    }
  }
  return children;
};

const validateTerminal = (term) => {
  if (!term || term.type !== 'Literal') {
    throw new Error('Invalid terminal');
  }
};

export const interpolateString = (value) => {
  const children = [];
  if (isArray(value)) {
    for (const element of value) {
      validateTerminal(element);

      children.push(element);
    }
  } else {
    // we can't safely interpolate strings here, though I wish we could
    validateTerminal(value);
    children.push(value);
  }

  return t.buildNode('String', 'Content', children);
};
