import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  OpenFragmentTag,
  CloseFragmentTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  ArrayInitializerTag,
  LiteralTag,
  EmbeddedNode,
  EmbeddedTagStream,
  EmbeddedObject,
} from './symbols.js';
import { printSource, referenceFlags } from './tree.js';

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

export const printArray = (arr) => `[${arr.map((v) => printExpression(v)).join(' ')}]`;

export const printTuple = (tup) => `(${tup.map((v) => printExpression(v)).join(' ')})`;

export const printObject = (obj) => {
  const entries = Object.entries(obj);
  return entries.length
    ? `{ ${entries.map(([k, v]) => `${k}: ${printExpression(v)}`).join(' ')} }`
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
    case EmbeddedTagStream:
      return value.value.map((v) => printTag(v)).join('');

    case EmbeddedObject: {
      return printObject(value.value);
    }

    case EmbeddedNode: {
      return printSource(value.value);
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
    ...when(type, [printType(type)]),
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

export const printGapTag = (tag) => {
  if (tag?.type !== GapTag) throw new Error();

  return `<//>`;
};

export const printArrayInitializerTag = (tag) => {
  if (tag?.type !== ArrayInitializerTag) throw new Error();

  return `[]`;
};

export const printShiftTag = (tag) => {
  if (tag?.type !== ShiftTag) throw new Error();

  return `^^^`;
};

export const printReferenceTag = (tag) => {
  if (tag?.type !== ReferenceTag) throw new Error();

  const { name, isArray, flags, index } = tag.value;
  const pathBraces = isArray ? `[${index || ''}]` : '';

  return `${name || ''}${pathBraces}${printReferenceFlags(flags)}:`;
};

export const printNullTag = (tag) => {
  if (tag && tag.type !== NullTag) {
    throw new Error();
  }

  return 'null';
};

export const printType = (type) => {
  return typeof type === 'string'
    ? type
    : typeof type === 'symbol'
    ? type.description.replace('@bablr/', '')
    : String(type);
};

export const printDoctypeTag = (tag) => {
  if (tag?.type !== DoctypeTag) throw new Error();

  let { doctype, version, attributes } = tag.value;

  attributes =
    attributes && Object.values(attributes).length ? ` ${printAttributes(attributes)}` : '';

  return `<!${version}:${doctype}${attributes}>`;
};

export const printLiteralTag = (tag) => {
  if (tag?.type !== LiteralTag) throw new Error();

  return printString(tag.value);
};

export const printReferenceFlags = (flags = referenceFlags) => {
  const plus = flags.expression ? '+' : '';
  const dollar = flags.hasGap ? '$' : '';

  return `${plus}${dollar}`;
};

export const printNodeFlags = (flags) => {
  const star = flags.token ? '*' : '';
  const dollar = flags.hasGap ? '$' : '';

  return `${star}${dollar}`;
};

export const printOpenNodeTag = (tag) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  const { flags, language: tagLanguage, type, attributes } = tag.value;

  const printedAttributes = attributes && printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  return `<${printNodeFlags(flags)}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
};

export const printOpenFragmentTag = (tag) => {
  if (tag?.type !== OpenFragmentTag) throw new Error();

  const { flags } = tag.value;

  return `<${printNodeFlags(flags)}>`;
};

export const printSelfClosingNodeTag = (tag, intrinsicValue) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  const { flags, language: tagLanguage, type, attributes } = tag.value;

  const printedAttributes = attributes && printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  const intrinsicFrag = intrinsicValue ? ` ${printString(intrinsicValue)}` : '';

  return `<${printNodeFlags(flags)}${printTagPath(
    tagLanguage,
    type,
  )}${intrinsicFrag}${attributesFrag} />`;
};

export const printCloseNodeTag = (tag) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

  return `</>`;
};

export const printCloseFragmentTag = (tag) => {
  if (tag?.type !== CloseFragmentTag) throw new Error();

  return `</>`;
};

export const printTag = (tag) => {
  if (!isObject(tag)) throw new Error();

  switch (tag?.type || NullTag) {
    case NullTag:
      return printNullTag(tag);

    case GapTag:
      return printGapTag(tag);

    case ArrayInitializerTag:
      return printArrayInitializerTag(tag);

    case ShiftTag:
      return printShiftTag(tag);

    case LiteralTag:
      return printLiteralTag(tag);

    case DoctypeTag:
      return printDoctypeTag(tag);

    case ReferenceTag:
      return printReferenceTag(tag);

    case OpenNodeTag:
      return printOpenNodeTag(tag);

    case CloseNodeTag:
      return printCloseNodeTag(tag);

    case OpenFragmentTag:
      return printOpenFragmentTag(tag);

    case CloseFragmentTag:
      return printCloseFragmentTag(tag);

    default:
      throw new Error();
  }
};
