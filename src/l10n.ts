// Host-side localisation (docs/SPEC.md "Localisation"): the only module that calls vscode.l10n.
// Translations are in l10n/bundle.l10n.<locale>.json, keyed by the English source strings.
import * as vscode from "vscode";
import { UI_STRINGS, UiLocale } from "./shared/uiStrings";

/** The VS Code display language and its translations; English when no bundle matches. */
export function vscodeLocale(): UiLocale {
  return {
    language: vscode.env.language,
    localize: (key, ...args) => vscode.l10n.t(UI_STRINGS[key], ...args),
  };
}
