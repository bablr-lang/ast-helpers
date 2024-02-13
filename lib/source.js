export function* sourceFromStream(terminals) {
  for (const terminal of terminals) {
    if (terminal.type === 'Literal') {
      yield* terminal.value;
    } else if (terminal.type === 'Gap') {
      yield null;
    }
  }
}

export function* sourceFromQuasis(quasis) {
  let first = true;

  for (const quasi of quasis) {
    if (!first) yield null;
    yield* quasi;
    first = false;
  }
}
