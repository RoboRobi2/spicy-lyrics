import {
  type CopyLine,
  FormatAllLyrics,
  FormatLine,
  GetCopyLine,
  HasCopyLines,
  WriteToClipboard,
} from "../../utils/Lyrics/CopyLyrics.ts";
import { Icons } from "../Styling/Icons.ts";

// Right-click menu on the lyrics: copy the line under the pointer, or the
// whole song. Built as plain DOM in the lyrics' own document so it also works
// in Popup Lyrics, which is a separate window that Spotify's React menus
// can't reach.

const FEEDBACK_MS = 700;
const EDGE_GAP = 8;

let openMenu: { element: HTMLElement; controller: AbortController } | null = null;

export function CloseCopyMenu() {
  if (!openMenu) return;
  openMenu.controller.abort();
  openMenu.element.remove();
  openMenu = null;
}

// Swaps a menu item or button to a short "Copied" state.
export function ShowCopyFeedback(element: HTMLElement, ok: boolean) {
  element.classList.toggle("Copied", ok);
  element.classList.toggle("CopyFailed", !ok);
}

function OpenCopyMenu(event: MouseEvent, line: CopyLine | undefined) {
  CloseCopyMenu();

  const doc = (event.target as Node).ownerDocument ?? document;
  const win = doc.defaultView ?? window;
  const controller = new AbortController();
  const { signal } = controller;

  const menu = doc.createElement("div");
  menu.className = "SpicyLyricsCopyMenu";
  menu.setAttribute("role", "menu");

  const addItem = (label: string, getText: () => string) => {
    const item = doc.createElement("button");
    item.className = "SpicyLyricsCopyMenu__Item";
    item.setAttribute("role", "menuitem");
    item.innerHTML = `
      <span class="SpicyLyricsCopyMenu__Icon SpicyLyricsCopyMenu__Icon--Copy">${Icons.CopyLyrics}</span>
      <span class="SpicyLyricsCopyMenu__Icon SpicyLyricsCopyMenu__Icon--Done">${Icons.Check}</span>
      <span class="SpicyLyricsCopyMenu__Label"></span>
    `;
    item.querySelector<HTMLElement>(".SpicyLyricsCopyMenu__Label")!.textContent = label;

    item.addEventListener(
      "click",
      async (e) => {
        e.stopPropagation();
        const ok = await WriteToClipboard(getText(), win);
        item.querySelector<HTMLElement>(".SpicyLyricsCopyMenu__Label")!.textContent = ok
          ? "Copied"
          : "Couldn't copy";
        ShowCopyFeedback(item, ok);
        menu.classList.add("Done");
        win.setTimeout(() => {
          if (openMenu?.element === menu) CloseCopyMenu();
        }, FEEDBACK_MS);
      },
      { signal }
    );
    menu.appendChild(item);
  };

  if (line) addItem("Copy Line", () => FormatLine(line));
  addItem("Copy All Lyrics", () => FormatAllLyrics());

  // documentElement is what Fullscreen requests, so body stays visible there.
  const host =
    doc.fullscreenElement && doc.fullscreenElement !== doc.documentElement
      ? doc.fullscreenElement
      : doc.body;
  host.appendChild(menu);
  openMenu = { element: menu, controller };

  // Open at the pointer, flipped back inside the window near the edges.
  const rect = menu.getBoundingClientRect();
  const viewW = doc.documentElement.clientWidth;
  const viewH = doc.documentElement.clientHeight;
  let x = event.clientX;
  let y = event.clientY;
  if (x + rect.width > viewW - EDGE_GAP) x = Math.max(EDGE_GAP, x - rect.width);
  if (y + rect.height > viewH - EDGE_GAP) y = Math.max(EDGE_GAP, y - rect.height);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.transformOrigin = `${x === event.clientX ? "left" : "right"} ${y === event.clientY ? "top" : "bottom"}`;

  // Auto-scroll moves the lyrics under an open menu all the time, so only the
  // user's own input closes it, not scroll events.
  const closeIfOutside = (e: Event) => {
    if (!menu.contains(e.target as Node)) CloseCopyMenu();
  };
  doc.addEventListener("pointerdown", closeIfOutside, { capture: true, signal });
  doc.addEventListener("wheel", closeIfOutside, { capture: true, passive: true, signal });
  doc.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") CloseCopyMenu();
    },
    { capture: true, signal }
  );
  win.addEventListener("blur", () => CloseCopyMenu(), { signal });
  win.addEventListener("resize", () => CloseCopyMenu(), { signal });
}

export function CopyLyricsContextMenuListener(event: MouseEvent) {
  // No lyrics (a notice, or still loading): leave the event alone.
  if (!HasCopyLines()) return;
  event.preventDefault();
  const lineElement = (event.target as Element | null)?.closest?.(".line");
  OpenCopyMenu(event, lineElement ? GetCopyLine(lineElement) : undefined);
}
