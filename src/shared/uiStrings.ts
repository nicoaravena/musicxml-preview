// User-facing runtime strings (docs/SPEC.md "Localisation"). Pure: no vscode, no node APIs, so
// the webview bundle can use it too.
//
// The English text is the `vscode.l10n.t` key: translations live in l10n/bundle.l10n.<locale>.json,
// keyed by these values. `{0}`, `{1}`... are placeholders filled from the arguments.

export const UI_STRINGS = {
  notScore: "The active file is not a MusicXML score.",
  previewTitle: "Preview {0}",
  emptyDocument: "This document is empty.",
  timewise: "score-timewise is not supported; convert to score-partwise.",
  readFailed: "The score file could not be read.",
  renderFailed: "The score could not be rendered.",
  notXml: "The document is not XML.",
} as const;

export type UiStringKey = keyof typeof UI_STRINGS;

/** Resolves a UI string in the user's language. The host passes one backed by `vscode.l10n`. */
export type Localize = (key: UiStringKey, ...args: string[]) => string;

/** Strings the webview shows on its own; it has no `vscode.l10n`, so the host resolves them. */
export interface WebviewStrings {
  renderFailed: string;
  notXml: string;
}

/** The English source strings, with placeholders filled in. */
export const english: Localize = (key, ...args) =>
  UI_STRINGS[key].replace(/\{(\d+)\}/g, (placeholder, index: string) => args[Number(index)] ?? placeholder);

/** The user's UI language (BCP 47, for `<html lang>`) and the matching string lookup. */
export interface UiLocale {
  readonly language: string;
  readonly localize: Localize;
}

export const ENGLISH: UiLocale = { language: "en", localize: english };
