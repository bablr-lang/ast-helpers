import { Coroutine } from '@bablr/coroutine';
import { printTerminal } from './print.js';
export * from './print.js';

export const getStreamIterator = (obj) => {
  return obj[Symbol.for('@@streamIterator')]?.() || obj[Symbol.iterator]?.();
};

export class SyncGenerator {
  constructor(embeddedGenerator) {
    if (!embeddedGenerator.next) throw new Error();

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

function* __generateCSTML(terminals) {
  if (!terminals) {
    yield* '<//>';
    return;
  }

  const co = new Coroutine(getStreamIterator(terminals));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const terminal = co.value;

    yield* printTerminal(terminal);
  }
}

export const generateCSTML = (terminals) => new StreamIterable(__generateCSTML(terminals));

export const printCSTML = (terminals) => {
  return stringFromStream(generateCSTML(terminals));
};

export const asyncStringFromStream = async (stream) => {
  const co = new Coroutine(getStreamIterator(stream));
  let str = '';

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }

    if (co.done) break;

    const terminal = co.value;

    str += printTerminal(terminal);
  }

  return str;
};

export const stringFromStream = (stream) => {
  const co = new Coroutine(stream[Symbol.iterator]());
  let str = '';

  for (;;) {
    co.advance();

    if (co.done) break;

    const terminal = co.value;

    str += printTerminal(terminal);
  }

  return str;
};

function* __generatePrettyCSTML(terminals, indent) {
  if (!terminals) {
    yield* '<//>';
    return;
  }

  const co = new Coroutine(getStreamIterator(terminals));
  let indentLevel = 0;
  let first = true;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const terminal = co.value;

    const inline =
      terminal.type === 'Null' ||
      terminal.type === 'Gap' ||
      (terminal.type === 'OpenNodeTag' && terminal.value.flags.intrinsic);

    if (!first && !inline) {
      yield* '\n';
    }

    if (['CloseNodeTag', 'CloseFragmentTag'].includes(terminal.type)) {
      indentLevel--;
    }

    if (!inline) {
      yield* indent.repeat(indentLevel);
    } else {
      yield* ' ';
    }
    yield* printTerminal(terminal);

    if (
      terminal.type === 'OpenFragmentTag' ||
      (terminal.type === 'OpenNodeTag' && !terminal.value.flags.intrinsic)
    ) {
      indentLevel++;
    }

    first = false;
  }
}

export const generatePrettyCSTML = (terminals, indent = '  ') => {
  return new StreamIterable(__generatePrettyCSTML(terminals, indent));
};

export const printPrettyCSTML = (terminals) => {
  return stringFromStream(generatePrettyCSTML(terminals));
};

export const getCooked = (terminals) => {
  let cooked = '';

  for (const terminal of terminals) {
    switch (terminal.type) {
      case 'Reference': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'OpenNodeTag': {
        const { flags, attributes } = terminal.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (flags.escape) {
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
    } else if (terminal.type === 'OpenNodeTag' && terminal.value.flags.intrinsic) {
      printed += terminal.value.intrinsicValue;
    }
  }

  return printed;
};

export function* generateSourceTextFor(terminals) {
  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      yield* terminal.value;
    } else if (terminal.type === 'OpenNodeTag' && terminal.value.flags.intrinsic) {
      yield* terminal.value.intrinsicValue;
    }
  }
}

export const sourceTextFor = printSource;

export const startsDocument = (terminal) => {
  const { type } = terminal;
  if (type === 'OpenFragmentTag' || type === 'DoctypeTag') {
    return true;
  } else if (type === 'OpenNodeTag') {
    const { flags } = terminal.value;

    return flags.trivia || flags.escape;
  }
};
