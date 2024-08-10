import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { printSelfClosingNodeTag, printTerminal } from './print.js';
import { buildWriteEffect, buildTokenGroup } from './builders.js';
export * from './print.js';

const getEmbeddedExpression = (obj) => {
  if (obj.type !== 'EmbeddedExpression') throw new Error();
  return obj.value;
};

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

export const isIntrinsicToken = (terminal) => {
  return (
    terminal.type === 'OpenNodeTag' && terminal.value.flags.intrinsic && terminal.value.flags.token
  );
};

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
      const effect = getEmbeddedExpression(terminal.value);
      if (effect.verb === 'write') {
        const writeEffect = getEmbeddedExpression(effect.value);
        if (writeEffect.stream == null || writeEffect.stream === 1) {
          yield* writeEffect.text;
        }
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
      const effect = getEmbeddedExpression(terminal.value);
      if (effect.verb === 'write') {
        const writeEffect = getEmbeddedExpression(effect.value);
        const prevStream = currentStream;
        currentStream = getEmbeddedExpression(writeEffect.options).stream || 1;
        if (prevStream && prevStream !== currentStream && !writeEffect.text.startsWith('\n')) {
          yield* '\n';
        }
        yield* writeEffect.text;
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

function* __generateCSTMLStrategy(terminals, options) {
  let { emitEffects = false, inline: inlineOption = true } = options;

  if (emitEffects) {
    throw new Error('You must use generatePrettyCSTML with emitEffects');
  }

  if (!terminals) {
    yield buildWriteEffect('<//>');
    return;
  }

  let prevTerminal = null;

  const co = new Coroutine(getStreamIterator(prettyGroupTokens(terminals)));

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

    if (terminal.type === 'Effect') {
      const effect = terminal.value;
      if (emitEffects && effect.verb === 'write') {
        yield buildWriteEffect(effect.value.text, effect.value.options);
      }
      continue;
    }

    if (terminal.type === 'TokenGroup') {
      const intrinsicValue = getCooked(terminal.value.slice(1, -1));
      yield buildWriteEffect(printSelfClosingNodeTag(terminal.value[0], intrinsicValue));
    } else {
      yield buildWriteEffect(printTerminal(terminal));
    }

    prevTerminal = terminal;
  }

  yield buildWriteEffect('\n');
}

export const prettyGroupTokens = (terminals) => new StreamIterable(__prettyGroupTokens(terminals));

function* __prettyGroupTokens(terminals) {
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;

  const co = new Coroutine(getStreamIterator(terminals));

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const terminal = co.value;
    const isOpenClose =
      terminal.type === 'CloseNodeTag' || (terminal.type === 'OpenNodeTag' && terminal.value.type);

    if (
      (terminal.type === 'Effect' && terminal.value.verb === 'write') ||
      ['Reference', 'DoctypeTag', 'Gap', 'Null'].includes(terminal.type) ||
      (terminal.type === 'OpenNodeTag' && !terminal.value.type) ||
      (state.open &&
        !isIntrinsicToken(state.open) &&
        (terminal.type === 'Literal' ||
          (terminal.type === 'OpenNodeTag' && terminal.value.flags.escape)))
    ) {
      state.broken = true;

      if (state.holding.length) {
        yield* state.holding;
        state.holding = [];
      }

      if (!isOpenClose && terminal.type !== 'Effect') {
        yield terminal;
      }
    } else if (!isOpenClose && terminal.type !== 'Effect') {
      state.holding.push(terminal);
    }

    if (terminal.type === 'Effect') {
      yield terminal;
    }

    if (terminal.type === 'CloseNodeTag') {
      if (!state.broken && (isIntrinsicToken(state.open) || state.holding.length === 1)) {
        state.holding.push(terminal);
        yield buildTokenGroup(state.holding);
      } else {
        if (state.holding.length) {
          yield* state.holding;
        }
        yield terminal;
      }

      states = states.pop();
      state = states.value;
    }

    if (terminal.type === 'OpenNodeTag' && terminal.value.type) {
      states = states.push({ holding: [terminal], broken: false, open: terminal });
      state = states.value;
    }
  }
}

export const generateCSTMLStrategy = (terminals, options = {}) =>
  new StreamIterable(__generateCSTMLStrategy(terminals, options));

function* __generatePrettyCSTMLStrategy(terminals, options) {
  let { indent = '  ', emitEffects = false, inline: inlineOption = true } = options;

  if (!terminals) {
    yield buildWriteEffect('<//>');
    return;
  }

  const co = new Coroutine(getStreamIterator(prettyGroupTokens(terminals)));
  let indentLevel = 0;
  let first = true;
  let inline = false;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const terminal = co.value;

    if (terminal.type === 'Effect') {
      const effect = getEmbeddedExpression(terminal.value);
      if (emitEffects && effect.verb === 'write') {
        const writeEffect = getEmbeddedExpression(effect.value);
        yield buildWriteEffect(
          (first ? '' : '\n') + writeEffect.text,
          getEmbeddedExpression(writeEffect.options),
        );

        inline = false;
        first = false;
      }
      continue;
    }

    inline =
      inlineOption &&
      inline &&
      (terminal.type === 'Null' || terminal.type === 'Gap' || terminal.type === 'TokenGroup');

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

    if (terminal.type === 'TokenGroup') {
      const intrinsicValue = getCooked(terminal.value.slice(1, -1));
      yield buildWriteEffect(printSelfClosingNodeTag(terminal.value[0], intrinsicValue));
    } else {
      yield buildWriteEffect(printTerminal(terminal));
    }

    if (terminal.type === 'Reference') {
      inline = true;
    }

    if (terminal.type === 'OpenNodeTag') {
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
    }
  }

  return printed;
};

export function* generateSourceTextFor(terminals) {
  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      yield* terminal.value;
    }
  }
}

export const sourceTextFor = printSource;
