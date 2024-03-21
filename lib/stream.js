import { printString, printAttributes } from './print.js';
export * from './print.js';

export const printTerminal = (terminal) => {
  if (terminal == null || terminal.type === 'Gap') {
    return `<//>`;
  } else if (terminal.type === 'Literal') {
    return printString(terminal.value);
  } else if (terminal.type === 'Reference') {
    const { pathName, pathIsArray } = terminal.value;
    const pathBraces = pathIsArray ? '[]' : '';
    return `${pathName}${pathBraces}:`;
  } else if (terminal.type === 'OpenNodeTag') {
    const { flags, type, attributes } = terminal.value;
    const printedAttributes = attributes && printAttributes(attributes);
    const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
    const star = flags.token ? '*' : '';
    const hash = flags.trivia ? '#' : '';

    if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

    return `<${star}${hash}${type}${attributesFrag}>`;
  } else if (terminal.type === 'OpenFragmentTag') {
    const { flags } = terminal.value;
    const hash = flags.trivia ? '#' : '';
    return `<${hash}>`;
  } else if (terminal.type === 'CloseNodeTag' || terminal.type === 'CloseFragmentTag') {
    return `</>`;
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

export const startsDocument = (terminal) => {
  const { type } = terminal;
  if (type === 'OpenFragmentTag') {
    return true;
  } else if (type === 'OpenNodeTag') {
    const { flags } = terminal.value;

    return flags.trivia || flags.escape;
  }
};
