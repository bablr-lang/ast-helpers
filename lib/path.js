import { WeakStackFrame } from '@bablr/weak-stack';
import * as btree from '@bablr/agast-helpers/btree';
import { ReferenceTag, ArrayInitializerTag, EmbeddedNode, DoctypeTag, GapTag } from './symbols.js';
import {
  buildArrayInitializerTag,
  buildEmbeddedNode,
  buildGapTag,
  buildReferenceTag,
} from './builders.js';

const { hasOwn } = Object;
const { isArray } = Array;

export const getProperties = (ref, properties) => {
  const { name, index, isArray } = ref.value;

  if (!hasOwn(properties, name)) {
    return null;
  }

  if (isArray) {
    return index != null ? btree.getAt(index, properties[name]) : properties[name];
  } else {
    return properties[name];
  }
};

export const getPropertiesSimple = (ref, properties) => {
  const { name, index, isArray } = ref.value;

  if (!hasOwn(properties, name)) {
    return null;
  }

  if (isArray) {
    return index != null ? properties[name][index] : properties[name];
  } else {
    return properties[name];
  }
};

export const get = (ref, node) => {
  const result = getProperties(ref, node.properties);
  return isArray(result) ? result : result?.node;
};

export const newSet = (node, ref, value) => {
  const { properties } = node;
  const { 1: name, 2: index } = /^([^\.]+|\.)(?:\.(\d+))?/.exec(path) || [];

  if (!name) throw new Error();

  if (index != null) {
    if (!hasOwn(properties, name)) {
      properties[name] = [];
    }
    properties[name] = btree.replaceAt(parseInt(index, 10), properties[name], value);
  } else {
    properties[name] = value;
  }

  return node;
};

export const add = (node, reference, value) => {
  const { properties } = node;
  const { name, isArray } = reference.value;

  if (node.type && name === '.') {
    throw new Error('Only fragments can have . properties');
  }

  if (name == null) throw new Error();

  node.children = btree.push(node.children, reference);

  if (name === '#' || name === '@') {
    node.children = btree.push(node.children, buildEmbeddedNode(value));
  } else {
    if (isArray) {
      if (!hasOwn(properties, name) || properties[name] === null) {
        properties[name] = [];
      }

      if (Array.isArray(value)) {
        if (value.length) throw new Error('Array value only allowed for initialization');

        properties[name] = [];
        node.children = btree.push(node.children, buildArrayInitializerTag(value));
      } else {
        properties[name] = btree.push(properties[name], { reference, node: value });
        node.children = btree.push(node.children, buildGapTag(value));
      }
    } else {
      properties[name] = { reference, node: value };
      node.children = btree.push(node.children, buildGapTag(value));
    }
  }
};

export function* allTagPathsFor(range) {
  let startPath = range[0];
  let endPath = range[1];
  let path = startPath;

  while (path) {
    yield path;

    if (endPath && path.childrenIndex === endPath.childrenIndex && path.path === endPath.path) {
      return;
    }

    path = path.next;
  }
}

export function* ownTagPathsFor(range) {
  if (!isArray(range)) throw new Error();

  const startPath = range[0];
  const endPath = range[1];

  let path = startPath;

  if (startPath.outer !== endPath.outer) throw new Error();

  const { children } = startPath.outer;

  for (let i = startPath.childrenIndex; i < endPath.childrenIndex; i++) {
    yield children[i];
  }
}

export class PathResolver {
  constructor() {
    this.childrenIndex = -1;
    this.counters = {};
    this._reference = null;
  }

  advance(tag) {
    this.childrenIndex++;

    const { counters } = this;
    if (tag.type === ReferenceTag) {
      const { isArray, name, hasGap } = tag.value;

      let resolvedReference = tag;

      this._reference = tag;

      if (isArray) {
        if (hasOwn(counters, name)) {
          const counter = ++counters[name];

          resolvedReference = buildReferenceTag(name, isArray, { hasGap }, counter);
        }
      } else if (name !== '@' && name !== '#') {
        if (hasOwn(counters, name)) throw new Error();

        counters[name] = true;
      }

      return resolvedReference;
    } else if (tag.type === ArrayInitializerTag) {
      counters[this._reference.value.name] = -1;
      return this._reference.value.name;
    }
  }
}

Object.freeze(PathResolver.prototype);

const findRight = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    const value = arr[i];
    if (predicate(value)) return value;
  }
  return null;
};

const skipLevels = 3;
const skipShiftExponentGrowth = 4;
const skipAmounts = new Array(skipLevels)
  .fill(null)
  .map((_, i) => 2 >> (i * skipShiftExponentGrowth));
const skipsByFrame = new WeakMap();

const buildSkips = (frame) => {
  let skipIdx = 0;
  let skipAmount = skipAmounts[skipIdx];
  let skips;
  while ((frame.depth & skipAmount) === skipAmount) {
    if (!skips) {
      skips = [];
      skipsByFrame.set(frame, skips);
    }

    skips[skipIdx] = frame.at(frame.depth - skipAmount);

    skipIdx++;
    skipAmount = skipAmounts[skipIdx];
  }
};

const skipToDepth = (depth, frame) => {
  let parent = frame;

  if (depth > frame.depth) throw new Error();

  let d = frame.depth;
  for (; d > depth; ) {
    const skips = skipsByFrame.get(frame);
    parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent;
    d = parent.depth;
  }
  return parent;
};

const buildBindings = (node) => {
  const { children, properties } = node;
  const referenceIndexes = new Array(children.length);
  const childrenIndexes = Object.fromEntries(Object.keys(properties).map((key) => [key, null]));

  const resolver = new PathResolver();

  for (const tag of btree.traverse(children)) {
    resolver.advance(tag);
    const i = resolver.childrenIndex;

    if (tag.type === ReferenceTag) {
      const { name, isArray, index } = tag.value;

      if (!name) throw new Error();
      // if (name === '.') throw new Error();

      const counter = isArray
        ? hasOwn(resolver.counters, name)
          ? resolver.counters[name]
          : null
        : null;

      if (index != null && index !== counter) throw new Error();

      referenceIndexes[i] = counter;

      if (isArray) {
        if (childrenIndexes[name] === null || !hasOwn(childrenIndexes, name)) {
          childrenIndexes[name] = [];
        } else if (counter >= 0) {
          childrenIndexes[name][counter] = i;
        } else {
          throw new Error();
        }
      } else {
        if (name !== '#' && name !== '@') {
          childrenIndexes[name] = i;
        }
      }
    } else {
      referenceIndexes[i] = null;
    }
  }

  return { referenceIndexes, childrenIndexes };
};

const nodeStates = new WeakMap();

export const Path = class AgastPath extends WeakStackFrame {
  static from(node) {
    return this.create(node);
  }

  constructor(parent, node, referenceIndex = null) {
    super(parent);

    if (!node) throw new Error();
    if (isArray(node)) throw new Error();

    this.node = node;
    this.referenceIndex = referenceIndex; // in the parent

    nodeStates.set(node, buildBindings(node));

    if (
      parent &&
      (!this.reference || ![ReferenceTag, DoctypeTag, EmbeddedNode].includes(this.reference.type))
    ) {
      throw new Error();
    }

    if (!Number.isFinite(this.depth)) throw new Error();

    buildSkips(this);
  }

  get referenceIndexes() {
    return nodeStates.get(this.node).referenceIndexes;
  }

  get childrenIndexes() {
    return nodeStates.get(this.node).childrenIndexes;
  }

  get reference() {
    return this.outer && btree.getAt(this.referenceIndex, this.outer.children);
  }

  get inner() {
    return this.node;
  }

  get outer() {
    return this.parent?.node;
  }

  get(reference) {
    const node = get(reference, this.node);

    return node && this.push(node, getPropertiesSimple(reference, this.childrenIndexes));
  }

  at(depth) {
    return skipToDepth(depth, this);
  }
};

export class TagPath {
  constructor(path, childrenIndex) {
    if (path == null || childrenIndex == null) throw new Error();

    this.path = path;
    this.childrenIndex = childrenIndex;
  }

  get tag() {
    return this.child;
  }

  get node() {
    return this.path.node;
  }

  get child() {
    return btree.getAt(this.childrenIndex, this.path.node.children);
  }

  get nextSibling() {
    const { path, childrenIndex } = this;

    const child = btree.getAt(childrenIndex + 1, path.node.children);

    return child ? new TagPath(path, childrenIndex + 1) : null;
  }

  get previousSibling() {
    const { path, childrenIndex } = this;

    const child = btree.getAt(childrenIndex - 1, path.node.children);

    return child ? new TagPath(path, childrenIndex - 1) : null;
  }

  get next() {
    let { path, childrenIndex } = this;

    let leaving = false;

    for (;;) {
      let tag = btree.getAt(childrenIndex, path.node.children);
      let isInitialTag = path.node === this.path.node && childrenIndex === this.childrenIndex;
      let wasLeaving = leaving;
      leaving = false;

      if (!isInitialTag && tag.type !== EmbeddedNode) {
        const tagPath = new TagPath(path, childrenIndex);
        return tagPath;
      } else if (tag.type === EmbeddedNode && !wasLeaving) {
        path = path.push(tag.value, childrenIndex);
        childrenIndex = 0;
      } else if (
        tag.type === ReferenceTag &&
        !(tag.value.name === '#' || tag.value.name === '@') &&
        (!tag.value.isArray || path.referenceIndexes[childrenIndex] != null)
      ) {
        const { name, isArray, flags } = tag.value;
        let resolvedReference = null;
        if (isArray) {
          let index = path.referenceIndexes[childrenIndex];
          resolvedReference = buildReferenceTag(name, index != null, flags, index);
        } else {
          resolvedReference = tag;
        }

        if (resolvedReference) {
          path = path.get(resolvedReference);
          childrenIndex = 0;

          if (!path) return null;
        }
      } else if (path.node && childrenIndex + 1 < btree.getSum(path.node.children)) {
        childrenIndex++;
      } else if (
        path.referenceIndex != null &&
        path.referenceIndex + (path.reference.type === EmbeddedNode ? 1 : 2) <
          btree.getSum(path.outer.children)
      ) {
        childrenIndex = path.referenceIndex + (path.reference.type === EmbeddedNode ? 1 : 2);
        path = path.parent;

        leaving = true;
      } else {
        return null;
      }
    }
  }

  get previous() {
    throw new Error('not implemented');
  }
}
