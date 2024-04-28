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
    .map(([k, v]) => (v === true ? k : v === false ? `!${k}` : `${k}=${printExpression(v)}`))
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

export const printGap = (terminal) => {
  if (terminal?.type !== 'Gap') throw new Error();

  return `<//>`;
};

export const printReference = (terminal) => {
  if (terminal?.type !== 'Reference') throw new Error();

  const { name, isArray } = terminal.value;
  const pathBraces = isArray ? '[]' : '';

  return `${name}${pathBraces}:`;
};

export const printNull = (terminal) => {
  if (terminal?.type !== 'Null') throw new Error();

  return 'null';
};

export const printType = (type) => {
  return typeof type === 'string'
    ? type
    : typeof type === 'symbol'
    ? `$${type.description.replace('@bablr/', '')}`
    : String(type);
};

export const printDoctypeTag = (terminal) => {
  if (terminal?.type !== 'DoctypeTag') throw new Error();

  let { doctype, version, attributes } = terminal.value;

  attributes = attributes ? ` ${printAttributes(attributes)}` : '';

  return `<!${version}:${doctype}${attributes}>`;
};

export const printLiteral = (terminal) => {
  if (terminal?.type !== 'Literal') throw new Error();

  return printString(terminal.value);
};

export const printFlags = (flags) => {
  const hash = flags.trivia ? '#' : '';
  const star = flags.token ? '*' : '';
  const at = flags.escape ? '@' : '';

  if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

  return `${hash}${star}${at}`;
};

export const printOpenNodeTag = (terminal) => {
  if (terminal?.type !== 'OpenNodeTag') throw new Error();

  const { flags, language: tagLanguage, type, attributes } = terminal.value;
  const printedAttributes = attributes && printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  return `<${printFlags(flags)}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
};

export const printOpenFragmentTag = (terminal) => {
  if (terminal?.type !== 'OpenFragmentTag') throw new Error();

  let { flags } = terminal.value;

  return `<${printFlags(flags)}>`;
};

export const printCloseNodeTag = (terminal) => {
  if (terminal?.type !== 'CloseNodeTag') throw new Error();

  return `</>`;
};

export const printCloseFragmentTag = (terminal) => {
  if (terminal?.type !== 'CloseFragmentTag') throw new Error();

  return `</>`;
};

export const printTerminal = (terminal) => {
  switch (terminal?.type || 'Null') {
    case 'Null':
      return printNull(terminal);

    case 'Gap':
      return printGap(terminal);

    case 'Literal':
      return printLiteral(terminal);

    case 'DoctypeTag':
      return printDoctypeTag(terminal);

    case 'Reference':
      return printReference(terminal);

    case 'OpenNodeTag':
      return printOpenNodeTag(terminal);

    case 'OpenFragmentTag':
      return printOpenFragmentTag(terminal);

    case 'CloseNodeTag':
      return printCloseNodeTag(terminal);

    case 'CloseFragmentTag':
      return printCloseFragmentTag(terminal);

    default:
      throw new Error();
  }
};
