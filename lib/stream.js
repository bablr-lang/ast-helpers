import { printString, printAttributes, printTagPath } from './print.js';
export * from './print.js';

export const printTerminal = (terminal) => {
  switch (terminal?.type || 'Null') {
    case 'Null': {
      return 'null';
    }

    case 'Gap': {
      return `<//>`;
    }

    case 'Literal': {
      return printString(terminal.value);
    }

    case 'DoctypeTag': {
      let { doctype, language, attributes } = terminal.value;

      language = printString(language);
      attributes = attributes ? ` ${printAttributes(attributes)}` : '';

      return `<!${doctype} ${language}${attributes}>`;
    }

    case 'Reference': {
      const { pathName, pathIsArray } = terminal.value;
      const pathBraces = pathIsArray ? '[]' : '';

      return `${pathName}${pathBraces}:`;
    }

    case 'OpenNodeTag': {
      const { flags, language: tagLanguage, type, attributes } = terminal.value;
      const printedAttributes = attributes && printAttributes(attributes);
      const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
      const star = flags.token ? '*' : '';
      const hash = flags.trivia ? '#' : '';
      const at = flags.escape ? '@' : '';

      if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

      return `<${star}${hash}${at}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
    }

    case 'OpenFragmentTag': {
      const { flags } = terminal.value;
      const hash = flags.trivia ? '#' : '';
      return `<${hash}>`;
    }

    case 'CloseNodeTag':
    case 'CloseFragmentTag': {
      return `</>`;
    }

    default:
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
