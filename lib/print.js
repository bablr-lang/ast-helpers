const { isInteger, isFinite } = Number;
const { isArray } = Array;
const isString = (val) => typeof val === 'string';
const isNumber = (val) => typeof val === 'number';
const isObject = (val) => val && typeof val === 'object' && !isArray(val);
const isFunction = (val) => typeof val === 'function';

const when = (condition, value) =>
  condition ? (isFunction(value) ? value() : value) : { *[Symbol.iterator]() {} };

export const printCall = (call) => {
  const { verb, arguments: args } = call;
  return `${verb}${printTuple(args)}`;
};

export const printArray = (arr) => `[${arr.map((v) => printExpression(v)).join(', ')}]`;

export const printTuple = (tup) => `(${tup.map((v) => printExpression(v)).join(', ')})`;

export const printObject = (obj) => {
  const entries = Object.entries(obj);
  return entries.length
    ? `{ ${entries.map(([k, v]) => `${k}: ${printExpression(v)}`).join(', ')} }`
    : '{}';
};

export const printExpression = (expr) => {
  if (isString(expr)) {
    return printString(expr);
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isNumber(expr)) {
    if (!isFinite(expr)) {
      if (isNaN(expr)) throw new Error();
      return expr === -Infinity ? '-Infinity' : '+Infinity';
    } else if (isInteger(expr)) {
      return String(expr);
    } else {
      throw new Error();
    }
  } else if (isArray(expr)) {
    return printArray(expr);
  } else if (typeof expr === 'object') {
    return printEmbedded(expr);
  } else {
    throw new Error();
  }
};

export const printEmbedded = (value) => {
  switch (value.type) {
    case 'EmbeddedTag':
      return printTerminal(value.value);

    case 'EmbeddedExpression': {
      return printObject(value.value);
    }

    case 'EmbeddedNode': {
      throw new Error('not implemented');
      break;
    }

    default:
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
  return [
    ...when(type && language?.length, () => [printLanguage(language)]),
    ...when(type, [type]),
  ].join(':');
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
  } else if (esc < ' ') {
    return `\\u${esc.charCodeAt(0).toString(16).padStart(4, '0')}`;
  } else {
    return `\\${esc}`;
  }
};

export const printSingleString = (str) => {
  return `'${str.replace(/['\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str) => {
  return `"${str.replace(/["\\\0\r\n\t\u0000-\u001A]/g, escapeReplacer)}"`;
};

export const printString = (str) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

export const printGap = (terminal) => {
  if (terminal?.type !== 'Gap') throw new Error();

  return `<//>`;
};

export const printShift = (terminal) => {
  if (terminal?.type !== 'Shift') throw new Error();

  return `^^^`;
};

export const printReference = (terminal) => {
  if (terminal?.type !== 'Reference') throw new Error();

  const { name, isArray } = terminal.value;
  const pathBraces = isArray ? '[]' : '';

  return `${name}${pathBraces}:`;
};

export const printNull = (terminal) => {
  if (terminal && terminal.type !== 'Null') {
    throw new Error();
  }

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

  attributes =
    attributes && Object.values(attributes).length ? ` ${printAttributes(attributes)}` : '';

  return `<!${version}:${doctype}${attributes}>`;
};

export const printLiteral = (terminal) => {
  if (terminal?.type !== 'Literal') throw new Error();

  return printString(terminal.value);
};

export const printFlags = (flags) => {
  const hash = flags.trivia ? '#' : '';
  const tilde = flags.intrinsic ? '~' : '';
  const star = flags.token ? '*' : '';
  const at = flags.escape ? '@' : '';
  const plus = flags.expression ? '+' : '';

  if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

  return `${hash}${tilde}${star}${at}${plus}`;
};

export const printOpenNodeTag = (terminal) => {
  if (terminal?.type !== 'OpenNodeTag') throw new Error();

  const { flags, language: tagLanguage, type, attributes } = terminal.value;

  const printedAttributes = attributes && printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  return `<${printFlags(flags)}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
};

export const printSelfClosingNodeTag = (terminal, intrinsicValue) => {
  if (terminal?.type !== 'OpenNodeTag') throw new Error();

  const { flags, language: tagLanguage, type, attributes } = terminal.value;

  const printedAttributes = attributes && printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  const intrinsicFrag = intrinsicValue ? ` ${printString(intrinsicValue)}` : '';

  return `<${printFlags(flags)}${printTagPath(
    tagLanguage,
    type,
  )}${intrinsicFrag}${attributesFrag} />`;
};

export const printCloseNodeTag = (terminal) => {
  if (terminal?.type !== 'CloseNodeTag') throw new Error();

  return `</>`;
};

export const printTerminal = (terminal) => {
  if (!isObject(terminal)) throw new Error();

  switch (terminal?.type || 'Null') {
    case 'Null':
      return printNull(terminal);

    case 'Gap':
      return printGap(terminal);

    case 'Shift':
      return printShift(terminal);

    case 'Literal':
      return printLiteral(terminal);

    case 'DoctypeTag':
      return printDoctypeTag(terminal);

    case 'Reference':
      return printReference(terminal);

    case 'OpenNodeTag':
      return printOpenNodeTag(terminal);

    case 'CloseNodeTag':
      return printCloseNodeTag(terminal);

    default:
      throw new Error();
  }
};
