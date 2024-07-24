import emptyStack from '@iter-tools/imm-stack';
import { Coroutine } from '@bablr/coroutine';
import {
  buildNodeCloseTag,
  buildNodeOpenTag,
  buildNull,
  buildEmbedded,
  nodeFlags,
  buildDoctypeTag,
} from './builders.js';
import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  printCSTML as printCSTMLFromStream,
  getStreamIterator,
  StreamIterable,
} from './stream.js';
export * from './builders.js';
export * from './print.js';

const arrayLast = (arr) => arr[arr.length - 1];

const isString = (str) => typeof str === 'string';

const buildFrame = (node) => {
  if (!node) throw new Error();
  return { node, childrenIdx: -1, resolver: new Resolver(node) };
};

const { hasOwn, freeze } = Object;

const get = (node, path) => {
  const { 1: name, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (index != null) {
    return node.properties[name]?.[parseInt(index, 10)];
  } else {
    return node.properties[name];
  }
};

function* __treeFromStream(tokens) {
  let nodes = emptyStack;
  let rootNode;
  let held = null;
  const co = new Coroutine(getStreamIterator(tokens));

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    const token = co.value;

    if (token.type === 'Effect') {
      continue;
    }

    if (token.type === 'DoctypeTag') {
      const { attributes } = token.value;

      rootNode = freeze({
        flags: nodeFlags,
        type: null,
        children: [],
        properties: {},
        attributes: freeze(attributes),
      });
      nodes = nodes.push(rootNode);
      continue;
    }

    if (!nodes.size) {
      throw new Error('imbalanced tag stack');
    }

    switch (token.type) {
      case 'Null': {
        break;
      }

      case 'Literal':
      case 'Reference': {
        nodes.value.children.push(token);
        break;
      }

      case 'Gap': {
        if (held) {
          const { children, properties } = nodes.value;
          const ref = arrayLast(children);

          if (ref.type !== 'Reference') throw new Error();

          if (ref.value.isArray) {
            if (!properties[ref.value.name]) {
              properties[ref.value.name] = [];
            }
            properties[ref.value.name].push(held);
          } else {
            properties[ref.value.name] = held;
          }

          held = null;
        }
        break;
      }

      case 'Shift': {
        const { children, properties } = nodes.value;

        const ref = arrayLast(children);
        let node = properties[ref.value.name];

        if (ref.value.isArray) {
          node = arrayLast(node);
          properties[ref.value.name].pop();
        } else {
          properties[ref.value.name] = null;
        }

        held = node;
        break;
      }

      case 'OpenNodeTag': {
        const buildStringTerminals = (str) => {
          // do better
          return [{ type: 'Literal', value: str }];
        };

        const { flags, language, type, intrinsicValue, attributes } = token.value;
        const node = nodes.value;

        if (!type) {
          break;
        }

        const newNode = freeze({
          flags,
          language,
          type,
          children: intrinsicValue && flags.intrinsic ? buildStringTerminals(intrinsicValue) : [],
          properties: {},
          attributes: freeze(attributes),
        });

        if (node && !(flags.escape || flags.trivia)) {
          if (!node.children.length) {
            throw new Error('Nodes must follow references');
          }

          const { name, isArray } = arrayLast(node.children).value;

          if (isArray) {
            if (!hasOwn(node.properties, name)) {
              node.properties[name] = [];
            }
            const array = node.properties[name];

            array.push(newNode);
          } else {
            node.properties[name] = newNode;
          }
        }

        if (intrinsicValue && flags.intrinsic) {
          freeze(newNode.children);
          freeze(newNode.properties);
          break;
        }

        nodes = nodes.push(newNode);
        break;
      }

      case 'CloseNodeTag': {
        const completedNode = nodes.value;
        const { flags } = completedNode;

        if (flags.escape || flags.trivia) {
          const parentChildren = nodes.prev.value.children;

          parentChildren.push(buildEmbedded(completedNode));
        }

        freeze(completedNode.properties);
        freeze(completedNode.children);

        if (!completedNode.type && nodes.size !== 1) {
          throw new Error('imbalanced tag stack');
        }

        nodes = nodes.pop();
        break;
      }

      default: {
        throw new Error();
      }
    }
  }

  return rootNode;
}

export const treeFromStream = (terminals) => new StreamIterable(__treeFromStream(terminals));

export const treeFromStreamSync = (tokens) => {
  return evaluateReturnSync(treeFromStream(tokens));
};

export const treeFromStreamAsync = async (tokens) => {
  return evaluateReturnAsync(treeFromStream(tokens));
};

export const evaluateReturnSync = (generator) => {
  const co = new Coroutine(generator[Symbol.iterator]());
  while (!co.done) co.advance();
  return co.value;
};

export const evaluateReturnAsync = async (generator) => {
  const co = new Coroutine(getStreamIterator(generator));
  while (!co.done) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }
  }
  return co.value;
};

export function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'Gap') {
    return rootNode;
  }

  yield buildDoctypeTag(rootNode.attributes);
  yield buildNodeOpenTag();

  let stack = emptyStack.push(buildFrame(rootNode));

  stack: while (stack.size) {
    const frame = stack.value;
    const { node, resolver } = frame;
    const { flags, language, type, children, attributes } = node;

    const intrinsicValue = flags.token && flags.intrinsic ? children[0]?.value : null;

    const children_ = intrinsicValue ? [intrinsicValue] : node.children;

    if (frame.childrenIdx === -1 && stack.size > 1) {
      yield buildNodeOpenTag(flags, language, type, intrinsicValue, attributes);
    }

    if (!intrinsicValue) {
      while (++frame.childrenIdx < children_.length) {
        const terminal = children_[frame.childrenIdx];

        switch (terminal.type) {
          case 'Literal':
          case 'Gap':
          case 'Null': {
            yield terminal;
            break;
          }

          case 'Embedded': {
            stack = stack.push(buildFrame(terminal.value));
            continue stack;
          }

          case 'Reference': {
            if (stack.size > 1) {
              yield terminal;
            }

            const resolved = resolver.consume(terminal).get(terminal);
            if (resolved) {
              stack = stack.push(buildFrame(resolved));
              continue stack;
            } else {
              yield buildNull();
              break;
            }
          }

          default: {
            throw new Error();
          }
        }
      }

      if (stack.size > 1) {
        yield buildNodeCloseTag(type, language);
      }
    }

    stack = stack.pop();
  }
  yield buildNodeCloseTag();
}

export const getCooked = (cookable) => {
  if (!cookable || cookable.type === 'Gap') {
    return '';
  }

  const children = cookable.children || cookable;

  let cooked = '';

  for (const terminal of children) {
    switch (terminal.type) {
      case 'Reference': {
        throw new Error('cookable nodes must not contain other nodes');
      }

      case 'Embedded': {
        const { flags, attributes } = terminal.value;

        if (!(flags.trivia || (flags.escape && attributes.cooked))) {
          throw new Error('cookable nodes must not contain other nodes');
        }

        if (flags.escape) {
          const { cooked: cookedValue } = attributes;

          if (!cookedValue && isString(cookedValue))
            throw new Error('cannot cook string: it contains uncooked escapes');

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

export const printCSTML = (rootNode) => {
  return printCSTMLFromStream(streamFromTree(rootNode));
};

export const printPrettyCSTML = (rootNode, indent = '  ') => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), indent);
};

export const printSource = (node) => {
  const resolver = new Resolver(node);
  let printed = '';

  if (node instanceof Promise) {
    printed += '$Promise';
  } else {
    for (const child of node.children) {
      if (child.type === 'Literal') {
        printed += child.value;
      } else if (child.type === 'Embedded') {
        printed += printSource(child.value);
      } else if (child.type === 'Reference') {
        const node_ = resolver.consume(child).get(child);

        if (node_ || !child.value.isArray) {
          printed += printSource(node_);
        }
      }
    }
  }

  return printed;
};

export const sourceTextFor = printSource;

export class Resolver {
  constructor(node, counters = new Map()) {
    this.node = node;
    this.counters = counters;
  }

  consume(reference) {
    const { name, isArray } = reference.value;
    const { counters } = this;

    if (isArray) {
      const count = counters.get(name) + 1 || 0;

      counters.set(name, count);
    } else {
      if (counters.has(name))
        throw new Error(`attempted to consume property {name: ${name}} twice`);

      counters.set(name, 1);
    }

    return this;
  }

  resolve(reference) {
    let { name, isArray } = reference.value;
    const { counters } = this;
    let path = name;

    if (isArray) {
      const count = counters.get(name) || 0;

      path += '.' + count;
    }

    return path;
  }

  get(reference) {
    if (!this.node) throw new Error('Cannot get from a resolver with no node');

    return get(this.node, this.resolve(reference));
  }

  branch() {
    return new Resolver(this.node, new Map(this.counters));
  }

  accept(resolver) {
    this.counters = resolver.counters;

    return this;
  }
}

freeze(Resolver.prototype);
