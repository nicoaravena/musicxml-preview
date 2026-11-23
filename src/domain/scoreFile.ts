// Score file detection (docs/SPEC.md "Score file detection"). Pure: no vscode, no node APIs.

export type ScoreRoot = "score-partwise" | "score-timewise";

export type ScoreClassification =
  | { kind: "text"; root?: ScoreRoot }
  | { kind: "mxl" }
  | { kind: "not-score" };

/** How much of a document callers should pass as `head`. */
export const SCORE_HEAD_CHARS = 64 * 1024;

const SCORE_ROOTS: readonly ScoreRoot[] = ["score-partwise", "score-timewise"];

/**
 * Classify a file as a MusicXML score.
 * `.mxl` is always a score, `.musicxml` is always a text score, `.xml` is a text score only
 * when its root element is a MusicXML score root. Never throws.
 */
export function classifyScoreFile(fileName: string, head: string): ScoreClassification {
  switch (extensionOf(fileName)) {
    case "mxl":
      return { kind: "mxl" };
    case "musicxml": {
      const root = scoreRootOf(head);
      return root ? { kind: "text", root } : { kind: "text" };
    }
    case "xml": {
      const root = scoreRootOf(head);
      return root ? { kind: "text", root } : { kind: "not-score" };
    }
    default:
      return { kind: "not-score" };
  }
}

function extensionOf(fileName: string): string {
  const baseStart = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\")) + 1;
  const base = fileName.slice(baseStart);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

function scoreRootOf(head: string): ScoreRoot | undefined {
  const name = rootElementName(head);
  return SCORE_ROOTS.find((root) => root === name);
}

/** Name of the first element after the prolog, or undefined if none is found in `head`. */
function rootElementName(head: string): string | undefined {
  let i = head.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    i = skipWhitespace(head, i);
    if (head.startsWith("<?", i)) {
      i = indexAfter(head, "?>", i);
    } else if (head.startsWith("<!--", i)) {
      i = indexAfter(head, "-->", i);
    } else if (head.startsWith("<!DOCTYPE", i)) {
      i = indexAfterDoctype(head, i);
    } else {
      break;
    }
    if (i === -1) {
      return undefined;
    }
  }
  // Name must be followed by whitespace, "/" or ">" so "<score-partwise-x>" does not match.
  const elementName = /<([A-Za-z_][\w.:-]*)(?=[\s/>])/y;
  elementName.lastIndex = i;
  return elementName.exec(head)?.[1];
}

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) {
    i++;
  }
  return i;
}

function indexAfter(text: string, token: string, from: number): number {
  const at = text.indexOf(token, from);
  return at === -1 ? -1 : at + token.length;
}

/** Skip `<!DOCTYPE ...>`, including quoted ids and an internal `[ ... ]` subset. */
function indexAfterDoctype(text: string, from: number): number {
  let depth = 0;
  for (let i = from + "<!DOCTYPE".length; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close === -1) {
        return -1;
      }
      i = close;
    } else if (c === "[") {
      depth++;
    } else if (c === "]") {
      depth--;
    } else if (c === ">" && depth <= 0) {
      return i + 1;
    }
  }
  return -1;
}
