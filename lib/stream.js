import emptyStack from '@iter-tools/imm-stack';
import { buildNodeCloseTag, buildNodeOpenTag } from './builders.js';
import { PathResolver } from './path.js';
import { printTerminal } from './print.js';
export * from './print.js';

export function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'Gap') {
    return rootNode;
  }

  let stack = emptyStack.push({
    node: rootNode,
    childrenIdx: 0,
    resolver: new PathResolver(rootNode),
  });

  while (stack.size) {
    const { node } = stack.value;
    const { type, attributes, flags } = stack.value.node;

    if (node.type) {
      yield buildNodeOpenTag(flags, type, attributes);
    }

    while (stack.value.childrenIdx < node.children.length) {
      const terminal = node.children[stack.value.childrenIdx];
      switch (terminal.type) {
        case 'Gap': {
          stack = stack.push(stack.value.resolver.get(terminal.value));
          break;
        }

        case 'Literal':
        case 'Reference': {
          yield terminal;
          break;
        }

        default: {
          throw new Error();
        }
      }
      stack.value.childrenIdx++;
    }

    yield buildNodeCloseTag();

    stack = stack.pop();
  }
}

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
    if (!first) {
      printed += '\n';
    }

    if (['CloseNodeTag', 'CloseFragmentTag'].includes(terminal.type)) {
      indentLevel--;
    }

    printed += indent.repeat(indentLevel);
    printed += printTerminal(terminal);

    if (['OpenFragmentTag', 'OpenNodeTag'].includes(terminal.type)) {
      indentLevel++;
    }

    first = false;
  }

  return printed;
};
