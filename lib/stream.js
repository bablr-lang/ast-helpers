import { Coroutine } from '@bablr/coroutine';
import { printTerminal } from './print.js';
import { buildWriteEffect } from './builders.js';
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
      return step;
    } else if (step.value instanceof Promise) {
      throw new Error('sync generators cannot resolve promises');
    } else {
      return step;
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
      return Promise.resolve(step);
    } else if (step.value instanceof Promise) {
      return step.value.then((value) => {
        return this.next(value);
      });
    } else {
      return Promise.resolve(step);
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
      return step;
    } else if (step.value instanceof Promise) {
      return step.value.then((value) => {
        return this.next(value);
      });
    } else {
      return step;
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

function* __generateCSTMLStrategy(terminals) {
  if (!terminals) {
    yield buildWriteEffect('<//>');
    return;
  }

  let prevTerminal = null;

  const co = new Coroutine(getStreamIterator(terminals));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const terminal = co.value;

    if (terminal.type === 'Reference' && prevTerminal.type === 'Null') {
      yield buildWriteEffect(' ');
    }

    if (terminal.type !== 'Effect') {
      buildWriteEffect(printTerminal(terminal));

      prevTerminal = terminal;
    } else {
      yield terminal;
    }
  }

  yield buildWriteEffect('\n');
}

export const generateCSTMLStrategy = (terminals) =>
  new StreamIterable(__generateCSTMLStrategy(terminals));

function* __generateStandardOutput(terminals) {
  const co = new Coroutine(getStreamIterator(terminals));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const terminal = co.value;

    if (terminal.type === 'Effect') {
      const effect = terminal.value;
      if (effect.verb === 'write' && (effect.value.stream == null || effect.value.stream === 1)) {
        yield* effect.value.text;
      }
    }
  }
}

export const generateStandardOutput = (terminals) =>
  new StreamIterable(__generateStandardOutput(terminals));

function* __generateAllOutput(terminals) {
  const co = new Coroutine(getStreamIterator(terminals));

  let currentStream = null;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const terminal = co.value;

    if (terminal.type === 'Effect') {
      const effect = terminal.value;
      if (effect.verb === 'write') {
        const prevStream = currentStream;
        currentStream = effect.value.options.stream || 1;
        if (prevStream && prevStream !== currentStream && !effect.value.text.startsWith('\n')) {
          yield* '\n';
        }
        yield* effect.value.text;
      }
    }
  }
}

export const generateAllOutput = (terminals) => new StreamIterable(__generateAllOutput(terminals));

export const printCSTML = (terminals) => {
  return stringFromStream(generateStandardOutput(generateCSTMLStrategy(terminals)));
};

function* __emptyStreamIterator() {}

export const emptyStreamIterator = () => new StreamIterable(__emptyStreamIterator());

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

    const chr = co.value;

    str += chr;
  }

  return str;
};

function* __generatePrettyCSTMLStrategy(terminals, options) {
  const { indent = '  ', emitEffects = false, inline: inlineOption = true } = options;

  if (!terminals) {
    yield buildWriteEffect('<//>');
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

    if (terminal.type === 'Effect') {
      const effect = terminal.value;
      if (emitEffects && effect.verb === 'write') {
        yield buildWriteEffect((first ? '' : '\n') + effect.value.text, effect.value.options);

        first = false;
      }
      continue;
    }

    const inline =
      inlineOption &&
      (terminal.type === 'Null' ||
        terminal.type === 'Gap' ||
        (terminal.type === 'OpenNodeTag' &&
          terminal.value.intrinsicValue &&
          terminal.value.flags.intrinsic));

    if (!first && !inline) {
      yield buildWriteEffect('\n');
    }

    if (terminal.type === 'CloseNodeTag') {
      if (indentLevel === 0) {
        throw new Error('imbalanced tag stack');
      }

      indentLevel--;
    }

    if (!inline) {
      yield buildWriteEffect(indent.repeat(indentLevel));
    } else {
      yield buildWriteEffect(' ');
    }
    yield buildWriteEffect(printTerminal(terminal));

    if (
      terminal.type === 'OpenNodeTag' &&
      (!terminal.value.intrinsicValue || !terminal.value.type)
    ) {
      indentLevel++;
    }

    first = false;
  }

  yield buildWriteEffect('\n');
}

export const generatePrettyCSTMLStrategy = (terminals, options = {}) => {
  return new StreamIterable(__generatePrettyCSTMLStrategy(terminals, options));
};

export const printPrettyCSTML = (terminals, options = {}) => {
  return stringFromStream(generateStandardOutput(generatePrettyCSTMLStrategy(terminals, options)));
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

  if (!terminals) return printed;

  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      printed += terminal.value;
    } else if (terminal.type === 'OpenNodeTag' && terminal.value.intrinsicValue) {
      printed += terminal.value.intrinsicValue;
    }
  }

  return printed;
};

export function* generateSourceTextFor(terminals) {
  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      yield* terminal.value;
    } else if (terminal.type === 'OpenNodeTag' && terminal.value.intrinsicValue) {
      yield* terminal.value.intrinsicValue;
    }
  }
}

export const sourceTextFor = printSource;

export const startsDocument = (terminal) => {
  const { type, value } = terminal;
  if ((type === 'OpenNodeTag' && !value.type) || type === 'DoctypeTag') {
    return true;
  } else if (type === 'OpenNodeTag') {
    const { flags } = value;

    return flags.trivia || flags.escape;
  }
};
