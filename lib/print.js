import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  ArrayInitializerTag,
  LiteralTag,
  EmbeddedNode,
  EmbeddedTag,
  EmbeddedObject,
  EmbeddedMatcher,
  EmbeddedRegex,
} from './symbols.js';
import { isEmptyReference, isGapNode, isNullNode, printSource, referenceFlags } from './tree.js';

let { isInteger, isFinite } = Number;
let { isArray } = Array;
let isString = (val) => typeof val === 'string';
let isNumber = (val) => typeof val === 'number';
let isObject = (val) => val && typeof val === 'object' && !isArray(val);
let isFunction = (val) => typeof val === 'function';

let when = (condition, value) =>
  condition ? (isFunction(value) ? value() : value) : { *[Symbol.iterator]() {} };

export const printCall = (call) => {
  let { verb, arguments: args } = call;
  return `${verb}${`(${args.map((v) => printExpression(v)).join(' ')})`}`;
};

export const printArray = (arr) => `[${arr.map((v) => printExpression(v)).join(', ')}]`;

export const printObject = (obj) => {
  let entries = Object.entries(obj);
  return entries.length
    ? `{ ${entries.map(([k, v]) => `${k}: ${printExpression(v)}`).join(', ')} }`
    : '{}';
};

export const printPropertyMatcher = (matcher) => {
  let { refMatcher, nodeMatcher } = matcher;
  let ref = { type: ReferenceTag, value: refMatcher };
  let refPart = refMatcher && !isEmptyReference(ref) ? `${printReferenceTag(ref)} ` : '';
  let nodePart;

  if (isArray(nodeMatcher)) {
    if (nodeMatcher.length) throw new Error();
    nodePart = '[]';
  } else if (isGapNode(nodeMatcher)) {
    nodePart = '<//>';
  } else if (isNullNode(nodeMatcher)) {
    nodePart = 'null';
  } else {
    nodePart = printOpenNodeMatcher(nodeMatcher);
  }
  return `${refPart}${nodePart}`;
};

export const printOpenNodeMatcher = (matcher) => {
  let { flags, language: tagLanguage, type, attributes, intrinsicValue } = matcher;

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  let intrinsicFrag = intrinsicValue
    ? ` ${isString(intrinsicValue) ? printExpression(intrinsicValue) : printSource(intrinsicValue)}`
    : '';
  let typeFrag = type !== Symbol.for('@bablr/fragment') ? printTagPath(tagLanguage, type) : ' ';

  return `<${printNodeFlags(flags)}${typeFrag}${intrinsicFrag}${attributesFrag}/>`;
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
    case EmbeddedTag:
      return `t\`${printTag(value.value)}\``;

    case EmbeddedMatcher:
      return `m\`${printSource(value.value)}\``;

    case EmbeddedRegex:
      return `re\`${printSource(value.value)}\``;

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
  const printed = attributes && printObject(attributes);
  return !printed || printed === '{}' ? '' : printed;
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

let escapeReplacer = (esc) => {
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

  let { name, isArray, flags, index } = tag.value;
  let pathBraces = isArray ? `[${index || ''}]` : '';

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
  let plus = flags.expression ? '+' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${plus}${dollar}`;
};

export const printNodeFlags = (flags) => {
  let star = flags.token ? '*' : '';
  let dollar = flags.hasGap ? '$' : '';

  return `${star}${dollar}`;
};

export const printOpenNodeTag = (tag) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, language: tagLanguage, type, attributes } = tag.value;

  if (!type) {
    return `<${printNodeFlags(flags)}>`;
  }

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  return `<${printNodeFlags(flags)}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
};

export const printSelfClosingNodeTag = (tag, intrinsicValue) => {
  if (tag?.type !== OpenNodeTag) throw new Error();

  let { flags, language: tagLanguage, type, attributes } = tag.value;

  let printedAttributes = printAttributes(attributes);
  let attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
  let intrinsicFrag = intrinsicValue ? ` ${printString(intrinsicValue)}` : '';

  return `<${printNodeFlags(flags)}${printTagPath(
    tagLanguage,
    type,
  )}${intrinsicFrag}${attributesFrag} />`;
};

export const printCloseNodeTag = (tag) => {
  if (tag?.type !== CloseNodeTag) throw new Error();

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

    default:
      throw new Error();
  }
};
