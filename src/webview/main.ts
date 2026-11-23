// Webview entry point, bundled with OSMD into out/webview.js (esbuild, browser IIFE).
// DOM glue only: the protocol lives in ./renderer, unit-tested without a DOM.
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { WebviewMessage } from "../shared/messages";
import { Banner, createRenderer, ScoreStage } from "./renderer";

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

const RESIZE_DEBOUNCE_MS = 200;

interface Page {
  element: HTMLElement;
  osmd: OpenSheetMusicDisplay;
}

/**
 * Double-buffered stage: each score is loaded and drawn into the hidden back page, which becomes
 * the front page only on success. A failed load or render leaves the front page as it was,
 * whatever OSMD does to its own container on failure (docs/SPEC.md "keep the last good render").
 * The back page is laid out at full width (absolute, visibility: hidden), so OSMD measures the
 * same width it will be shown at.
 */
function createStage(paper: HTMLElement): ScoreStage {
  const [frontElement, backElement] = Array.from(paper.querySelectorAll<HTMLElement>(".page"));
  const page = (element: HTMLElement): Page => ({
    element,
    // autoResize is off: only the visible page is re-laid out, by the listener below.
    osmd: new OpenSheetMusicDisplay(element, { autoResize: false, backend: "svg" }),
  });
  let front = page(frontElement);
  let back = page(backElement);
  let hasScore = false;

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (hasScore) {
        front.osmd.render();
      }
    }, RESIZE_DEBOUNCE_MS);
  });

  const setRole = ({ element }: Page, role: "front" | "back"): void => {
    element.classList.remove("front", "back");
    element.classList.add(role);
    element.toggleAttribute("aria-hidden", role === "back");
  };

  return {
    async show(input: string | Blob): Promise<void> {
      await back.osmd.load(input);
      back.osmd.render();
      [front, back] = [back, front];
      setRole(front, "front");
      setRole(back, "back");
      hasScore = true;
    },
  };
}

function createBanner(element: HTMLElement): Banner {
  return {
    show(message: string): void {
      element.textContent = message;
      element.hidden = false;
    },
    clear(): void {
      element.hidden = true;
      element.textContent = "";
    },
  };
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Preview page is missing #${id}`);
  }
  return element;
}

const vscode = acquireVsCodeApi();
const renderer = createRenderer({
  stage: createStage(requireElement("paper")),
  banner: createBanner(requireElement("banner")),
  post: (message) => vscode.postMessage(message),
});
window.addEventListener("message", (event: MessageEvent) => void renderer.handle(event.data));
renderer.start();
