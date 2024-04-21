const { isInteger, isFinite } = Number;
const { isArray } = Array;
const isString = (val) => typeof val === 'string';
const isNumber = (val) => typeof val === 'number';

export const printExpression = (expr) => {
  if (isString(expr)) {
    return printString(expr);
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isNumber(expr)) {
    if (!isInteger(expr) && isFinite(expr)) {
      throw new Error();
    }
    return String(expr);
  } else if (isArray(expr)) {
    return `[${expr.map((v) => printExpression(v)).join(', ')}]`;
  } else if (typeof expr === 'object') {
    return `{${Object.entries(expr).map(([k, v]) => `${k}: ${printExpression(v)}`)}}`;
  } else {
    throw new Error();
  }
};

export const printAttributes = (attributes) => {
  return Object.entries(attributes)
    .map(([k, v]) => (v === true ? k : `${k}=${printExpression(v)}`))
    .join(' ');
};

export const printLanguage = (language) => {
  if (isString(language)) {
    return printSingleString(language);
  } else {
    return language.join('.');
  }
};

export const printTagPath = (language, type) => {
  return language?.length ? `${printLanguage(language)}:${type}` : type;
};

const escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\t') {
    return '\\t';
  } else if (esc === '\0') {
    return '\\0';
  } else {
    return `\\${esc}`;
  }
};

export const printSingleString = (str) => {
  return `'${str.replace(/['\\\0\r\n\t]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str) => {
  return `"${str.replace(/["\\\0\r\n\t]/g, escapeReplacer)}"`;
};

export const printString = (str) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

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

      return `<${hash}${star}${at}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
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
