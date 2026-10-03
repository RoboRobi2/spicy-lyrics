// deno-lint-ignore-file no-explicit-any

import { $copyLyricsFormat } from "../stores.ts";
import { HasRenderableText } from "./EmptyLines.ts";
import { PickDisplayText } from "./Applyer/Utils/PickDisplayText.ts";
import { StripZeroWidth } from "./Applyer/Utils/StripZeroWidth.ts";

// The text behind the copy button and the line context menu.
//
// The appliers register every line here as they render it, with the text they
// actually display (romanized or not). Copying reads from this list rather
// than from the DOM: the virtualizer only keeps the visible lines mounted, and
// syllable lines are split into word and letter elements whose spacing lives
// in CSS, so their textContent has no spaces.

export interface CopyWord {
  Text: string;
  StartTime: number;
  EndTime: number;
  // No space follows this syllable (it continues the same word).
  JoinNext: boolean;
}

export interface CopyLine {
  Text: string;
  // Seconds, as in the lyrics payload. Absent for static lyrics.
  StartTime?: number;
  EndTime?: number;
  Background?: boolean;
  // Syllable lyrics only.
  Words?: CopyWord[];
}

export type CopyFormat = "plain" | "lrc" | "elrc";

let copyLines: CopyLine[] = [];
const copyLineByElement = new WeakMap<Element, CopyLine>();

export function ResetCopyLines() {
  copyLines = [];
}

export function AddCopyLine(element: Element, line: CopyLine) {
  // A syllable line can be kept for its background vocals alone, leaving the
  // lead empty; it would only add a blank line.
  if (!line.Text) return;
  copyLines.push(line);
  copyLineByElement.set(element, line);
}

export function GetCopyLine(element: Element): CopyLine | undefined {
  return copyLineByElement.get(element);
}

export function HasCopyLines(): boolean {
  return copyLines.length > 0;
}

const cleanText = (text: string) => StripZeroWidth(text).replace(/\s+/g, " ").trim();

export function DisplayLineText(entry: any, useRomanized: boolean): string {
  return cleanText(PickDisplayText(entry, useRomanized));
}

// Builds the copy entry for a lead or background syllable group, filtering the
// syllables the same way the applier does.
export function SyllableCopyLine(
  group: { StartTime: number; EndTime: number; Syllables: any[] },
  useRomanized: boolean,
  background = false
): CopyLine {
  const syllables = group.Syllables.filter(HasRenderableText);
  const words: CopyWord[] = syllables.map((syllable, index) => ({
    Text: cleanText(PickDisplayText(syllable, useRomanized)),
    StartTime: syllable.StartTime,
    EndTime: syllable.EndTime,
    JoinNext: !!syllable.IsPartOfWord && index < syllables.length - 1,
  }));

  return {
    Text: cleanText(words.map((w) => w.Text + (w.JoinNext ? "" : " ")).join("")),
    StartTime: group.StartTime,
    EndTime: group.EndTime,
    Background: background,
    Words: words,
  };
}

export function GetCopyFormat(): CopyFormat {
  const format = $copyLyricsFormat.get();
  return format === "lrc" || format === "elrc" ? format : "plain";
}

// The format a copy will actually produce, for the whole song or one line:
// static lyrics have no timing at all, and line-synced lyrics have no word
// timing.
export function EffectiveCopyFormat(
  format: CopyFormat = GetCopyFormat(),
  lines: CopyLine[] = copyLines
): CopyFormat {
  if (format === "plain") return "plain";
  if (!lines.some((line) => line.StartTime !== undefined)) return "plain";
  if (format === "elrc" && !lines.some((line) => line.Words?.length)) return "lrc";
  return format;
}

const hasParens = (text: string) => text.startsWith("(") && text.endsWith(")");
const withParens = (text: string) => (hasParens(text) ? text : `(${text})`);

// mm:ss.xx, as LRC expects. Minutes keep counting past 59.
function lrcTime(seconds: number): string {
  const centis = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centis / 6000);
  const secs = Math.floor((centis % 6000) / 100);
  const cs = centis % 100;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function elrcWords(line: CopyLine): string {
  const words = line.Words ?? [];
  if (words.length === 0) return line.Text;
  let out = "";
  words.forEach((word, index) => {
    out += `<${lrcTime(word.StartTime)}>${word.Text}`;
    if (index < words.length - 1 && !word.JoinNext) out += " ";
  });
  return out + `<${lrcTime(words[words.length - 1].EndTime)}>`;
}

function lrcHeader(): string[] {
  const item: any = Spicetify?.Player?.data?.item;
  const header: string[] = [];
  const title = item?.name;
  const artists = (item?.artists ?? []).map((a: any) => a?.name).filter(Boolean).join(", ");
  const album = item?.album?.name ?? item?.metadata?.album_title;
  if (title) header.push(`[ti:${title}]`);
  if (artists) header.push(`[ar:${artists}]`);
  if (album) header.push(`[al:${album}]`);
  return header;
}

function formatLine(line: CopyLine, format: CopyFormat): string {
  if (format === "plain") return line.Background ? withParens(line.Text) : line.Text;

  const time = `[${lrcTime(line.StartTime ?? 0)}]`;
  if (format === "elrc" && line.Words?.length) {
    // Background vocals keep their word timing; the brackets go around the
    // words so the tags stay parseable.
    return line.Background && !hasParens(line.Text)
      ? `${time}(${elrcWords(line)})`
      : `${time}${elrcWords(line)}`;
  }
  return `${time}${line.Background ? withParens(line.Text) : line.Text}`;
}

export function FormatAllLyrics(format: CopyFormat = GetCopyFormat()): string {
  const effective = EffectiveCopyFormat(format);
  const body = copyLines.map((line) => formatLine(line, effective));
  if (effective === "plain") return body.join("\n");

  const header = lrcHeader();
  return [...header, ...(header.length ? [""] : []), ...body].join("\n");
}

// One line in the chosen format, without the song header. Plain text stays
// exactly what is shown, so a background line has no added brackets.
export function FormatLine(line: CopyLine, format: CopyFormat = GetCopyFormat()): string {
  const effective = EffectiveCopyFormat(format, [line]);
  return effective === "plain" ? line.Text : formatLine(line, effective);
}

export async function WriteToClipboard(text: string, win: Window = window): Promise<boolean> {
  // The popout is its own window, and only the focused document may write.
  try {
    await win.navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to Spotify's own clipboard bridge.
  }
  try {
    const api = (Spicetify as any)?.Platform?.ClipboardAPI;
    if (typeof api?.copy === "function") {
      await api.copy(text);
      return true;
    }
  } catch {
    // Nothing left to try.
  }
  return false;
}
