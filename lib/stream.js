import emptyStack from '@iter-tools/imm-stack';
import { buildFragmentCloseTag, buildNodeCloseTag, buildNodeOpenTag } from './builders.js';
import { PathResolver } from './path.js';
import { printString, printAttributes } from './print.js';
export * from './print.js';

const buildFrame = (node) => {
  return { node, childrenIdx: 0, resolver: new PathResolver(node) };
};

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
    } else {
      yield buildFragmentCloseTag(flags);
    }

    while (stack.value.childrenIdx < node.children.length) {
      const terminal = node.children[stack.value.childrenIdx];

      stack.value.childrenIdx++;

      switch (terminal.type) {
        case 'Gap': {
          stack = stack.push(buildFrame(stack.value.resolver.get(terminal.value)));
          break;
        }

        case 'Embedded': {
          stack = stack.push(buildFrame(terminal.value));
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
    }

    if (node.type) {
      yield buildNodeCloseTag();
    } else {
      yield buildFragmentCloseTag();
    }

    stack = stack.pop();
  }
}

export const printTerminal = (terminal) => {
  if (terminal.type === 'Literal') {
    return printString(terminal.value);
  } else if (terminal.type === 'Gap' || terminal == null) {
    return `<//>`;
  } else if (terminal.type === 'Reference') {
    const { pathName, pathIsArray } = terminal.value;
    const pathBraces = pathIsArray ? '[]' : '';
    return `${pathName}${pathBraces}:`;
  } else if (terminal.type === 'OpenNodeTag') {
    const { flags, type, attributes } = terminal.value;
    const printedAttributes = attributes && printAttributes(attributes);
    const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
    const star = flags.syntactic ? '*' : '';
    const hash = flags.trivia ? '#' : '';

    if (flags.trivia && flags.syntactic) throw new Error('Node cannot be trivia and syntax');

    return `<${star}${hash}${type}${attributesFrag}>`;
  } else if (terminal.type === 'OpenFragmentTag') {
    const { flags } = terminal.value;
    const hash = flags.trivia ? '#' : '';
    return `<${hash}>`;
  } else if (terminal.type === 'CloseNodeTag' || terminal.type === 'CloseFragmentTag') {
    return `</>`;
  } else if (terminal.type === 'Null') {
    return `null`;
  } else {
    throw new Error();
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
          cooked += terminal.value.attributes.cooked;
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
