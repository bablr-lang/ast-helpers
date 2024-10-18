import { Coroutine } from '@bablr/coroutine';
import emptyStack from '@iter-tools/imm-stack';
import { printSelfClosingNodeTag, printTag } from './print.js';
import { buildWriteEffect, buildTokenGroup } from './builders.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  ArrayTag,
  LiteralTag,
  EmbeddedExpression,
  TokenGroup,
  OpenFragmentTag,
  CloseFragmentTag,
} from './symbols.js';

export * from './print.js';

const getEmbeddedExpression = (obj) => {
  if (obj.type !== EmbeddedExpression) throw new Error();
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

function* __isEmpty(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    let depth = 0;

    const tag = co.value;

    switch (tag.type) {
      case OpenFragmentTag:
      case OpenNodeTag:
        if (tag.value.flags.trivia) {
          ++depth;
        }

        if (depth === 0 && tag.value.flags.escape) {
          return false;
        }

        break;

      case CloseFragmentTag:
      case CloseNodeTag:
        --depth;
        break;

      case LiteralTag:
      case GapTag:
        return false;
    }
  }

  return true;
}

export const isEmpty = (tags) =>
  new StreamIterable(__isEmpty(tags))[Symbol.iterator]().next().value;

function* __generateStandardOutput(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const tag = co.value;

    if (tag.type === 'Effect') {
      const effect = tag.value;
      if (effect.verb === 'write') {
        const writeEffect = getEmbeddedExpression(effect.value);
        if (writeEffect.stream == null || writeEffect.stream === 1) {
          yield* writeEffect.text;
        }
      }
    }
  }
}

export const generateStandardOutput = (tags) => new StreamIterable(__generateStandardOutput(tags));

function* __generateAllOutput(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  let currentStream = null;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const tag = co.value;

    if (tag.type === 'Effect') {
      const effect = tag.value;
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

export const generateAllOutput = (tags) => new StreamIterable(__generateAllOutput(tags));

export const printCSTML = (tags) => {
  return stringFromStream(generateStandardOutput(generateCSTMLStrategy(tags)));
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

    const tag = co.value;

    str += printTag(tag);
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

function* __generateCSTMLStrategy(tags, options) {
  let { emitEffects = false, inline: inlineOption = true } = options;

  if (!tags) {
    yield buildWriteEffect('<//>');
    return;
  }

  let prevTag = null;

  const co = new Coroutine(getStreamIterator(prettyGroupTokens(tags)));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }
    if (co.done) break;

    const tag = co.value;

    if (tag.type === ReferenceTag && prevTag.type === NullTag) {
      yield buildWriteEffect(' ');
    }

    if (tag.type === 'Effect') {
      const effect = tag.value;
      if (emitEffects && effect.verb === 'write') {
        yield buildWriteEffect(effect.value.text, effect.value.options);
      }
      continue;
    }

    if (tag.type === TokenGroup) {
      const intrinsicValue = getCooked(tag.value);
      yield buildWriteEffect(printSelfClosingNodeTag(tag.value[0], intrinsicValue));
    } else {
      yield buildWriteEffect(printTag(tag));
    }

    prevTag = tag;
  }

  yield buildWriteEffect('\n');
}

export const generateCSTMLStrategy = (tags, options = {}) =>
  new StreamIterable(__generateCSTMLStrategy(tags, options));

const isToken = (tag) => {
  return tag.value.flags.token;
};

export const prettyGroupTokens = (tags) => new StreamIterable(__prettyGroupTokens(tags));

function* __prettyGroupTokens(tags) {
  let states = emptyStack.push({ holding: [], broken: false, open: null });
  let state = states.value;

  const co = new Coroutine(getStreamIterator(tags));

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const tag = co.value;
    const isOpenClose =
      tag.type === CloseNodeTag ||
      tag.type === OpenNodeTag ||
      tag.type === CloseFragmentTag ||
      tag.type === OpenFragmentTag;

    if (
      (tag.type === 'Effect' && tag.value.verb === 'write') ||
      [ReferenceTag, DoctypeTag, GapTag, NullTag, ArrayTag, ShiftTag, OpenFragmentTag].includes(
        tag.type,
      ) ||
      (tag.type === OpenNodeTag && tag.value.flags.escape)
    ) {
      state.broken = true;

      if (state.holding.length) {
        yield* state.holding;
        state.holding = [];
      }
    } else if (tag.type === LiteralTag) {
      state.holding.push(tag);
    }

    if (!state.holding.length && !isOpenClose) {
      yield tag;
    }

    if (tag.type === CloseNodeTag || tag.type === CloseFragmentTag) {
      if (!state.broken && (isToken(state.open) || state.holding.length === 1)) {
        state.holding.push(tag);
        yield buildTokenGroup(state.holding);
      } else {
        if (state.holding.length) {
          yield* state.holding;
        }
        yield tag;
      }

      states = states.pop();
      state = states.value;
    }

    if (tag.type === OpenNodeTag || tag.type === OpenFragmentTag) {
      if (tag.type === OpenFragmentTag) {
        states = states.push({ holding: [], broken: false, open: tag });
        yield tag;
      } else {
        states = states.push({ holding: [tag], broken: false, open: tag });
      }

      state = states.value;
    }
  }
}

function* __generatePrettyCSTMLStrategy(tags, options) {
  let { indent = '  ', emitEffects = false, inline: inlineOption = true } = options;

  if (!tags) {
    yield buildWriteEffect('<//>');
    return;
  }

  const co = new Coroutine(getStreamIterator(prettyGroupTokens(tags)));
  let indentLevel = 0;
  let first = true;
  let inline = false;
  let ref = null;

  for (;;) {
    co.advance();

    if (co.done) break;

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    const tag = co.value;

    if (tag.type === 'Effect') {
      const effect = tag.value;
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
      ref &&
      (tag.type === NullTag ||
        tag.type === GapTag ||
        tag.type === ArrayTag ||
        tag.type === TokenGroup);

    if (!first && !inline) {
      yield buildWriteEffect('\n');
    }

    if (tag.type === CloseNodeTag || tag.type === CloseFragmentTag) {
      ref = null;
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

    if (tag.type === TokenGroup) {
      ref = null;
      const intrinsicValue = tag.value[0].value.flags.token ? getCooked(tag.value) : null;
      yield buildWriteEffect(printSelfClosingNodeTag(tag.value[0], intrinsicValue));
    } else {
      yield buildWriteEffect(printTag(tag));
    }

    if (tag.type === ReferenceTag) {
      inline = true;
      ref = tag;
    }

    if (tag.type === OpenNodeTag || tag.type === OpenFragmentTag) {
      indentLevel++;
    }

    first = false;
  }

  yield buildWriteEffect('\n');
}

export const generatePrettyCSTMLStrategy = (tags, options = {}) => {
  return new StreamIterable(__generatePrettyCSTMLStrategy(tags, options));
};

export const printPrettyCSTML = (tags, options = {}) => {
  return stringFromStream(generateStandardOutput(generatePrettyCSTMLStrategy(tags, options)));
};

export const getCooked = (tags) => {
  let cooked = '';

  let first = true;
  let foundLast = false;
  let depth = 0;

  for (const tag of tags) {
    if (foundLast) throw new Error();

    switch (tag.type) {
      case ReferenceTag: {
        if (depth === 1) {
          throw new Error('cookable nodes must not contain other nodes');
        }
        break;
      }

      case OpenFragmentTag:
      case OpenNodeTag: {
        const { flags, attributes } = tag.value;

        depth++;

        if (first) {
          if (flags.token) {
            break;
          } else {
            throw new Error(JSON.stringify(flags));
          }
        }

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (flags.escape) {
          const { cooked: cookedValue } = tag.value.attributes;

          if (!cookedValue) throw new Error('cannot cook string: it contains uncooked escapes');

          cooked += cookedValue;
        }

        break;
      }

      case CloseFragmentTag:
      case CloseNodeTag: {
        if (depth === 1) {
          foundLast = true;
        }
        depth--;
        break;
      }

      case LiteralTag: {
        if (depth === 1) {
          cooked += tag.value;
        }
        break;
      }

      default: {
        throw new Error();
      }
    }

    first = false;
  }

  return cooked;
};

export const printSource = (tags) => {
  let printed = '';

  if (!tags) return printed;

  for (const tag of tags) {
    if (tag.type === LiteralTag) {
      printed += tag.value;
    }
  }

  return printed;
};

export function* generateSourceTextFor(tags) {
  for (const tag of tags) {
    if (tag.type === LiteralTag) {
      yield* tag.value;
    }
  }
}

export const sourceTextFor = printSource;
