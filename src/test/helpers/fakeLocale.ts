import { UiLocale } from "../../shared/uiStrings";

/**
 * Resolves strings as `key|arg...`, so tests can see which string was asked for, with what
 * arguments, and that no English text was hard-coded past the localiser.
 */
export const FAKE_LOCALE: UiLocale = {
  language: "xx",
  localize: (key, ...args) => [key, ...args].join("|"),
};
