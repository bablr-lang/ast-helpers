import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { printSelfClosingNodeTag, printTag } from './print.js';
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

export const isIntrinsicToken = (Tag) => {
  return Tag.type === 'OpenNodeTag' && Tag.value.flags.intrinsic && Tag.value.flags.token;
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

function* __generateStandardOutput(Tags) {
  const co = new Coroutine(getStreamIterator(Tags));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const Tag = co.value;

    if (Tag.type === 'Effect') {
      const effect = getEmbeddedExpression(Tag.value);
      if (effect.verb === 'write') {
        const writeEffect = getEmbeddedExpression(effect.value);
        if (writeEffect.stream == null || writeEffect.stream === 1) {
          yield* writeEffect.text;
        }
      }
    }
  }
}

export const generateStandardOutput = (Tags) => new StreamIterable(__generateStandardOutput(Tags));

function* __generateAllOutput(Tags) {
  const co = new Coroutine(getStreamIterator(Tags));

  let currentStream = null;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const Tag = co.value;

    if (Tag.type === 'Effect') {
      const effect = getEmbeddedExpression(Tag.value);
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

export const generateAllOutput = (Tags) => new StreamIterable(__generateAllOutput(Tags));

export const printCSTML = (Tags) => {
  return stringFromStream(generateStandardOutput(generateCSTMLStrategy(Tags)));
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

    const Tag = co.value;

    str += printTag(Tag);
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

function* __generateCSTMLStrategy(Tags, options) {
  let { emitEffects = false, inline: inlineOption = true } = options;

  if (!Tags) {
    yield buildWriteEffect('<//>');
    return;
  }

  let prevTag = null;

  const co = new Coroutine(getStreamIterator(prettyGroupTokens(Tags)));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const Tag = co.value;

    if (Tag.type === 'Reference' && prevTag.type === 'Null') {
      yield buildWriteEffect(' ');
    }

    if (Tag.type === 'Effect') {
      const effect = Tag.value;
      if (emitEffects && effect.verb === 'write') {
        yield buildWriteEffect(effect.value.text, effect.value.options);
      }
      continue;
    }

    if (Tag.type === 'TokenGroup') {
      const intrinsicValue = getCooked(Tag.value.slice(1, -1));
      yield buildWriteEffect(printSelfClosingNodeTag(Tag.value[0], intrinsicValue));
    } else {
      yield buildWriteEffect(printTag(Tag));
    }

    prevTag = Tag;
  }

  yield buildWriteEffect('\n');
}

export const generateCSTMLStrategy = (Tags, options = {}) =>
  new StreamIterable(__generateCSTMLStrategy(Tags, options));

export const prettyGroupTokens = (Tags) => new StreamIterable(__prettyGroupTokens(Tags));

function* __prettyGroupTokens(Tags) {
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;

  const co = new Coroutine(getStreamIterator(Tags));

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const Tag = co.value;
    const isOpenClose =
      Tag.type === 'CloseNodeTag' || (Tag.type === 'OpenNodeTag' && Tag.value.type);

    if (
      (Tag.type === 'Effect' && Tag.value.verb === 'write') ||
      ['Reference', 'DoctypeTag', 'Gap', 'Null'].includes(Tag.type) ||
      (Tag.type === 'OpenNodeTag' && !Tag.value.type) ||
      (state.open &&
        !isIntrinsicToken(state.open) &&
        (Tag.type === 'LiteralTag' || (Tag.type === 'OpenNodeTag' && Tag.value.flags.escape)))
    ) {
      state.broken = true;

      if (state.holding.length) {
        yield* state.holding;
        state.holding = [];
      }

      if (!isOpenClose && Tag.type !== 'Effect') {
        yield Tag;
      }
    } else if (!isOpenClose && Tag.type !== 'Effect') {
      state.holding.push(Tag);
    }

    if (Tag.type === 'Effect') {
      yield Tag;
    }

    if (Tag.type === 'CloseNodeTag') {
      if (!state.broken && (isIntrinsicToken(state.open) || state.holding.length === 1)) {
        state.holding.push(Tag);
        yield buildTokenGroup(state.holding);
      } else {
        if (state.holding.length) {
          yield* state.holding;
        }
        yield Tag;
      }

      states = states.pop();
      state = states.value;
    }

    if (Tag.type === 'OpenNodeTag' && Tag.value.type) {
      states = states.push({ holding: [Tag], broken: false, open: Tag });
      state = states.value;
    }
  }
}

function* __generatePrettyCSTMLStrategy(Tags, options) {
  let { indent = '  ', emitEffects = false, inline: inlineOption = true } = options;

  if (!Tags) {
    yield buildWriteEffect('<//>');
    return;
  }

  const co = new Coroutine(getStreamIterator(prettyGroupTokens(Tags)));
  let indentLevel = 0;
  let first = true;
  let inline = false;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const Tag = co.value;

    if (Tag.type === 'Effect') {
      const effect = getEmbeddedExpression(Tag.value);
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
      (Tag.type === 'Null' || Tag.type === 'Gap' || Tag.type === 'TokenGroup');

    if (!first && !inline) {
      yield buildWriteEffect('\n');
    }

    if (Tag.type === 'CloseNodeTag') {
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

    if (Tag.type === 'TokenGroup') {
      const intrinsicValue = getCooked(Tag.value.slice(1, -1));
      yield buildWriteEffect(printSelfClosingNodeTag(Tag.value[0], intrinsicValue));
    } else {
      yield buildWriteEffect(printTag(Tag));
    }

    if (Tag.type === 'Reference') {
      inline = true;
    }

    if (Tag.type === 'OpenNodeTag') {
      indentLevel++;
    }

    first = false;
  }

  yield buildWriteEffect('\n');
}

export const generatePrettyCSTMLStrategy = (Tags, options = {}) => {
  return new StreamIterable(__generatePrettyCSTMLStrategy(Tags, options));
};

export const printPrettyCSTML = (Tags, options = {}) => {
  return stringFromStream(generateStandardOutput(generatePrettyCSTMLStrategy(Tags, options)));
};

export const getCooked = (Tags) => {
  let cooked = '';

  for (const Tag of Tags) {
    switch (Tag.type) {
      case 'Reference': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'OpenNodeTag': {
        const { flags, attributes } = Tag.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (flags.escape) {
          const { cooked: cookedValue } = Tag.value.attributes;

          if (!cookedValue) throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case 'LiteralTag': {
        cooked += Tag.value;
        break;
      }

      default: {
        throw new Error();
      }
    }
  }

  return cooked;
};

export const printSource = (Tags) => {
  let printed = '';

  if (!Tags) return printed;

  for (const Tag of Tags) {
    if (Tag.type === 'LiteralTag') {
      printed += Tag.value;
    }
  }

  return printed;
};

export function* generateSourceTextFor(Tags) {
  for (const Tag of Tags) {
    if (Tag.type === 'LiteralTag') {
      yield* Tag.value;
    }
  }
}

export const sourceTextFor = printSource;
