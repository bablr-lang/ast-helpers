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

const escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\0') {
    return '\\0';
  } else {
    return `\\${esc}`;
  }
};

export const printSingleString = (str) => {
  return `'${str.replace(/['\\\0\r\n]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str) => {
  return `"${str.replace(/["\\\0\r\n]/g, escapeReplacer)}"`;
};

export const printString = (str) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

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

export const printToken = printTerminal;
