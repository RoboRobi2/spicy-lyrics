import { useStore } from "@nanostores/react";
import {
  $copyLyricsFormat,
  $creditsFollowLastLine,
  $duetLinePadding,
  $lineHoverBackground,
  $lyricsSize,
  $minimalLyricsMode,
  $pinnedCredits,
  $rendererVisualStyle,
  $romanizationDisplay,
  $showCopyLyricsButton,
  $syllableMerge,
  $syllablePace,
  RENDERER_VISUAL_STYLES,
  RENDERER_VISUAL_STYLE_LABELS,
  type PinnedCredits,
  type RendererVisualStyle,
  type RomanizationDisplay,
  type SyllableMerge,
} from "../../../utils/stores.ts";
import { Select, Slider, Toggle } from "./components.tsx";
import { LyricsIcon } from "./icons.tsx";
import type { GroupDef, SectionDef } from "./model.ts";

// Built once: the Control components must keep their identity across renders.
const groups: GroupDef[] = [
  {
    title: "Text",
    settings: [
      {
        id: "lyricsSize",
        label: "Lyrics Size",
        description:
          "Makes the lyrics bigger or smaller in every view, including romanization and background vocals. 100% is each view's usual size.",
        keywords: "font text scale bigger smaller zoom",
        stacked: true,
        Control: ({ label }) => (
          <Slider
            label={label}
            value={useStore($lyricsSize)}
            min={60}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={(v) => $lyricsSize.set(v)}
          />
        ),
      },
    ],
  },
  {
    title: "Style",
    settings: [
      {
        id: "rendererVisualStyle",
        label: "Renderer Visual Style",
        description:
          "Visual design of rendered lyrics. \"Spring\" is the default Spicy Lyrics renderer you know.",
        keywords: "simple lyrics mode refreshed renderer animation effects plain spring bloom",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($rendererVisualStyle)}
            options={[...RENDERER_VISUAL_STYLES]}
            labels={RENDERER_VISUAL_STYLES.map((style) => RENDERER_VISUAL_STYLE_LABELS[style])}
            onChange={(v) => $rendererVisualStyle.set(v as RendererVisualStyle)}
          />
        ),
      },
      {
        id: "minimalLyricsMode",
        label: "Fade Away Previous Lines",
        description: "Hide lines that have already been sung in Fullscreen and Cinema View.",
        keywords: "minimal lyrics mode hide sung",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($minimalLyricsMode)}
            onChange={(v) => $minimalLyricsMode.set(v)}
          />
        ),
      },
      {
        id: "syllableMerge",
        label: "Join Split Words",
        description:
          "Show a word sung in syllables as one word. Steadily Sung keeps only words with no gap and an even pace between parts; Held Words only those long enough to light up letter by letter.",
        keywords: "syllables merge held steady",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($syllableMerge)}
            options={["off", "full", "steady", "held"]}
            labels={["Off", "All Words", "Steadily Sung", "Held Words"]}
            onChange={(v) => $syllableMerge.set(v as SyllableMerge)}
          />
        ),
      },
      {
        id: "syllablePace",
        label: "Keep Syllable Pace",
        description:
          "A joined word that lights up letter by letter follows each syllable's timing, slow on a long syllable and quick on a short one.",
        keywords: "syllables merge held letters timing",
        useDisabled: () => useStore($syllableMerge) === "off" && "Pick a Join Split Words mode to change this.",
        Control: ({ disabled, label }) => (
          <Toggle
            label={label}
            checked={useStore($syllablePace)}
            onChange={(v) => $syllablePace.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
  {
    title: "Lines",
    settings: [
      {
        id: "romanizationDisplay",
        label: "Romanization",
        description:
          "With romanization on, show it in place of the original lyrics, or as a smaller row under each line.",
        keywords: "romaji romanized romanize pronunciation under below replace",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($romanizationDisplay)}
            options={["replace", "underLine"]}
            labels={["Replace the line", "Under each line"]}
            onChange={(v) => $romanizationDisplay.set(v as RomanizationDisplay)}
          />
        ),
      },
      {
        id: "lineHoverBackground",
        label: "Highlight on Hover",
        description: "Show a soft box behind a line when you point at it.",
        keywords: "line hover background",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($lineHoverBackground)}
            onChange={(v) => $lineHoverBackground.set(v)}
          />
        ),
      },
      {
        id: "duetLinePadding",
        label: "Duet Line Padding",
        description: "Indent each singer's lines toward their side, so duets read as two columns.",
        keywords: "indent voices",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($duetLinePadding)}
            onChange={(v) => $duetLinePadding.set(v)}
          />
        ),
      },
      {
        id: "creditsFollowLastLine",
        label: "Credits Follow the Last Singer",
        description:
          "When a song ends on a duet line on the right, show the songwriter and provider lines on the right too.",
        keywords: "duet credits written by songwriters provided by provider align side",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($creditsFollowLastLine)}
            onChange={(v) => $creditsFollowLastLine.set(v)}
          />
        ),
      },
      {
        id: "pinnedCredits",
        label: "Pinned Credits",
        description:
          "Keep the credits at the bottom of the lyrics while they scroll. No Writers pins the lyrics source and community line, Full pins the songwriters too.",
        keywords: "credits footer pin sticky written by songwriters provided by source community bottom",
        Control: ({ label }) => (
          <Select
            label={label}
            value={useStore($pinnedCredits)}
            options={["off", "noWriters", "full"]}
            labels={["Off", "No Writers", "Full"]}
            onChange={(v) => $pinnedCredits.set(v as PinnedCredits)}
          />
        ),
      },
    ],
  },
  {
    title: "Copying",
    settings: [
      {
        id: "showCopyLyricsButton",
        label: "Copy Lyrics Button",
        description:
          "Show a button in the view controls that copies the lyrics. Right-clicking a line works either way.",
        keywords: "copy clipboard lrc",
        Control: ({ label }) => (
          <Toggle
            label={label}
            checked={useStore($showCopyLyricsButton)}
            onChange={(v) => $showCopyLyricsButton.set(v)}
          />
        ),
      },
      {
        id: "copyLyricsFormat",
        label: "Copy Lyrics Format",
        description:
          "Applies to copying a line and the whole song. LRC adds timestamps per line, Enhanced LRC per word. Handy for making TTMLs.",
        keywords: "copy clipboard lrc ttml timestamps",
        Control: ({ label, disabled }) => (
          <Select
            label={label}
            value={useStore($copyLyricsFormat)}
            options={["plain", "lrc", "elrc"]}
            labels={["Plain Text", "LRC", "Enhanced LRC"]}
            onChange={(v) => $copyLyricsFormat.set(v)}
            disabled={disabled}
          />
        ),
      },
    ],
  },
];

export const lyricsSection: SectionDef = {
  id: "lyrics",
  title: "Lyrics",
  icon: LyricsIcon,
  groups: () => groups,
};
