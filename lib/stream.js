import { printTerminal } from './print.js';
export * from './print.js';

export const getStreamIterator = (obj) => {
  return obj[Symbol.for('@@streamIterator')]?.() || obj[Symbol.iterator]?.();
};

export class SyncGenerator {
  constructor(embeddedGenerator) {
    this.generator = embeddedGenerator;
  }

  next(value) {
    const step = this.generator.next(value);

    if (step instanceof Promise) {
      throw new Error('invalid embedded generator');
    }

    if (step.done) {
      return { value: undefined, done: true };
    } else if (step.value instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    } else {
      const { value } = step;
      return { value, done: false };
    }
  }

  return(value) {
    const step = this.generator.return(value);
    if (step instanceof Promise) {
      throw new Error('invalid embedded generator');
    }

    if (step.value instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    }
    return step;
  }

  [Symbol.iterator]() {
    return this;
  }
}

export class AsyncGenerator {
  constructor(embeddedGenerator) {
    this.generator = embeddedGenerator;
  }

  next(value) {
    const step = this.generator.next(value);

    if (step instanceof Promise) {
      throw new Error('invalid embedded generator');
    }

    if (step.done) {
      return Promise.resolve({ value: undefined, done: true });
    } else if (step.value instanceof Promise) {
      return step.value.then((value) => {
        return this.next(value);
      });
    } else {
      const { value } = step;
      return Promise.resolve({ value, done: false });
    }
  }

  return(value) {
    const result = this.generator.return(value);
    if (result instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    }
    return result;
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

export class StreamGenerator {
  constructor(embeddedGenerator) {
    this.generator = embeddedGenerator;
  }

  next(value) {
    const step = this.generator.next(value);

    if (step.done) {
      return { value: undefined, done: true };
    } else if (step.value instanceof Promise) {
      return step.value.then((value) => {
        return this.next(value);
      });
    } else {
      const { value } = step;
      return { value, done: false };
    }
  }

  return(value) {
    return this.generator.return(value);
  }

  [Symbol.for('@@streamIterator')]() {
    return this;
  }
}

export class StreamIterable {
  constructor(embeddedStreamIterable) {
    this.iterable = embeddedStreamIterable;
  }

  [Symbol.iterator]() {
    return new SyncGenerator(this.iterable);
  }

  [Symbol.asyncIterator]() {
    return new AsyncGenerator(this.iterable);
  }

  [Symbol.for('@@streamIterator')]() {
    return new StreamGenerator(this.iterable);
  }
}

export const maybeWait = (maybePromise, callback) => {
  if (maybePromise instanceof Promise) {
    return maybePromise.then(callback);
  } else {
    return callback(maybePromise);
  }
};

export const printCSTML = (terminals) => {
  if (!terminals) {
    return '<//>';
  }

  let printed = '';

  for (const terminal of terminals) {
    printed += printTerminal(terminal);
  }

  return printed;
};

export const printPrettyCSTML = (terminals, indent = '  ') => {
  if (!terminals) {
    return '<//>';
  }

  let printed = '';
  let indentLevel = 0;
  let first = true;

  for (const terminal of terminals) {
    if (!first && terminal.type !== 'Null') {
      printed += '\n';
    }

    if (['CloseNodeTag', 'CloseFragmentTag'].includes(terminal.type)) {
      indentLevel--;
    }

    if (terminal.type !== 'Null') {
      printed += indent.repeat(indentLevel);
    } else {
      printed += ' ';
    }
    printed += printTerminal(terminal);

    if (['OpenFragmentTag', 'OpenNodeTag'].includes(terminal.type)) {
      indentLevel++;
    }

    first = false;
  }

  return printed;
};

export const getCooked = (terminals) => {
  let cooked = '';

  for (const terminal of terminals) {
    switch (terminal.type) {
      case 'Reference': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'StartNode': {
        const { flags, attributes } = terminal.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (!flags.trivia) {
          const { cooked: cookedValue } = terminal.value.attributes;

          if (!cookedValue) throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
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

export const printSource = (terminals) => {
  let printed = '';

  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      printed += terminal.value;
    }
  }

  return printed;
};

export function* sourceTextFor(terminals) {
  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      yield* terminal.value;
    }
  }
}

export const startsDocument = (terminal) => {
  const { type } = terminal;
  if (type === 'OpenFragmentTag' || type === 'DoctypeTag') {
    return true;
  } else if (type === 'OpenNodeTag') {
    const { flags } = terminal.value;

    return flags.trivia || flags.escape;
  }
};
