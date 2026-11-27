import type { SVGProps } from "react";

interface PixelIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function PixelSvg({ size = 16, children, className = "", ...rest }: PixelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={`px-icon ${className}`.trim()}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Traditional tiled-roof Japanese house / inn icon (16x16 hollow pixel grid) */
export function PixelHomeIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="7" y="1" width="2" height="1" />
      <rect x="5" y="2" width="6" height="1" />
      <rect x="3" y="3" width="10" height="1" />
      <rect x="1" y="4" width="14" height="2" />
      <rect x="0" y="5" width="16" height="1" />
      {/* Left & right walls + roof lintel */}
      <rect x="3" y="6" width="10" height="1" />
      <rect x="3" y="7" width="2" height="7" />
      <rect x="11" y="7" width="2" height="7" />
      {/* Center pillars framing doorway */}
      <rect x="5" y="7" width="6" height="2" />
      <rect x="5" y="9" width="1" height="5" />
      <rect x="10" y="9" width="1" height="5" />
      <rect x="2" y="14" width="12" height="1" />
    </PixelSvg>
  );
}

/** Open picture book icon */
export function PixelBookIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="1" y="3" width="6" height="1" />
      <rect x="9" y="3" width="6" height="1" />
      <rect x="1" y="4" width="1" height="9" />
      <rect x="7" y="4" width="2" height="10" />
      <rect x="14" y="4" width="1" height="9" />
      <rect x="2" y="12" width="5" height="1" />
      <rect x="9" y="12" width="5" height="1" />
      <rect x="3" y="6" width="3" height="1" />
      <rect x="3" y="8" width="3" height="1" />
      <rect x="3" y="10" width="2" height="1" />
      <rect x="10" y="6" width="3" height="1" />
      <rect x="10" y="8" width="3" height="1" />
      <rect x="10" y="10" width="2" height="1" />
    </PixelSvg>
  );
}

/** Exam clipboard / scroll icon */
export function PixelExamIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="1" width="6" height="2" />
      <rect x="3" y="2" width="2" height="1" />
      <rect x="11" y="2" width="2" height="1" />
      <rect x="2" y="3" width="1" height="12" />
      <rect x="13" y="3" width="1" height="12" />
      <rect x="3" y="14" width="10" height="1" />
      <rect x="5" y="5" width="6" height="1" />
      <rect x="5" y="8" width="4" height="1" />
      <rect x="10" y="7" width="1" height="2" />
      <rect x="5" y="11" width="6" height="1" />
    </PixelSvg>
  );
}

/** Crisp pixel play triangle */
export function PixelPlayIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="4" y="2" width="2" height="12" />
      <rect x="6" y="3" width="2" height="10" />
      <rect x="8" y="4" width="2" height="8" />
      <rect x="10" y="5" width="2" height="6" />
      <rect x="12" y="7" width="2" height="2" />
    </PixelSvg>
  );
}

/** Retro pixel headphones for dictation & listening */
export function PixelHeadphonesIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="2" width="6" height="2" />
      <rect x="3" y="3" width="2" height="2" />
      <rect x="11" y="3" width="2" height="2" />
      <rect x="2" y="5" width="2" height="4" />
      <rect x="12" y="5" width="2" height="4" />
      <rect x="1" y="8" width="4" height="5" />
      <rect x="11" y="8" width="4" height="5" />
      <rect x="2" y="13" width="3" height="1" />
      <rect x="11" y="13" width="3" height="1" />
    </PixelSvg>
  );
}

/** Kanji / vocabulary ink stamp (文) */
export function PixelKanjiIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="7" y="1" width="2" height="2" />
      <rect x="2" y="3" width="12" height="2" />
      <rect x="4" y="5" width="2" height="3" />
      <rect x="10" y="5" width="2" height="3" />
      <rect x="6" y="8" width="4" height="2" />
      <rect x="4" y="10" width="3" height="2" />
      <rect x="9" y="10" width="3" height="2" />
      <rect x="2" y="12" width="3" height="2" />
      <rect x="11" y="12" width="3" height="2" />
    </PixelSvg>
  );
}

/** Japanese reading scroll / page */
export function PixelScrollIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="3" y="1" width="10" height="2" />
      <rect x="2" y="2" width="1" height="1" />
      <rect x="13" y="2" width="1" height="1" />
      <rect x="4" y="3" width="1" height="10" />
      <rect x="11" y="3" width="1" height="10" />
      <rect x="6" y="5" width="4" height="1" />
      <rect x="6" y="7" width="4" height="1" />
      <rect x="6" y="9" width="3" height="1" />
      <rect x="6" y="11" width="4" height="1" />
      <rect x="3" y="13" width="10" height="2" />
    </PixelSvg>
  );
}

/** Pixel cinema clapperboard / animation frame (hollow pixel grid) */
export function PixelFilmIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      {/* Clapper top bar with diagonal notches */}
      <rect x="1" y="2" width="2" height="3" />
      <rect x="5" y="2" width="2" height="3" />
      <rect x="9" y="2" width="2" height="3" />
      <rect x="13" y="2" width="2" height="3" />
      <rect x="1" y="5" width="14" height="2" />
      {/* Hollow frame + pixel play triangle inside */}
      <rect x="1" y="7" width="2" height="7" />
      <rect x="13" y="7" width="2" height="7" />
      <rect x="1" y="13" width="14" height="2" />
      <rect x="6" y="8" width="2" height="4" />
      <rect x="8" y="9" width="2" height="2" />
    </PixelSvg>
  );
}

/** 4-point pixel sparkle star */
export function PixelSparkleIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="7" y="1" width="2" height="3" />
      <rect x="7" y="12" width="2" height="3" />
      <rect x="1" y="7" width="3" height="2" />
      <rect x="12" y="7" width="3" height="2" />
      <rect x="6" y="4" width="4" height="8" />
      <rect x="4" y="6" width="8" height="4" />
    </PixelSvg>
  );
}

/** Crisp pixel checkmark */
export function PixelCheckIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="2" y="8" width="2" height="2" />
      <rect x="4" y="10" width="2" height="2" />
      <rect x="6" y="11" width="2" height="2" />
      <rect x="8" y="9" width="2" height="2" />
      <rect x="10" y="7" width="2" height="2" />
      <rect x="12" y="5" width="2" height="2" />
      <rect x="13" y="3" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel right arrow */
export function PixelArrowRightIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="2" y="7" width="9" height="2" />
      <rect x="9" y="4" width="2" height="8" />
      <rect x="11" y="5" width="2" height="6" />
      <rect x="13" y="7" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel left arrow */
export function PixelArrowLeftIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="7" width="9" height="2" />
      <rect x="5" y="4" width="2" height="8" />
      <rect x="3" y="5" width="2" height="6" />
      <rect x="1" y="7" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel speaker with sound waves */
export function PixelSpeakerIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="1" y="6" width="3" height="4" />
      <rect x="4" y="5" width="2" height="6" />
      <rect x="6" y="3" width="2" height="10" />
      <rect x="8" y="2" width="1" height="12" />
      <rect x="11" y="5" width="1" height="6" />
      <rect x="13" y="3" width="1" height="10" />
      <rect x="14" y="5" width="1" height="6" />
    </PixelSvg>
  );
}

/** Crisp pixel pause bars */
export function PixelPauseIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="3" y="2" width="4" height="12" />
      <rect x="9" y="2" width="4" height="12" />
    </PixelSvg>
  );
}

/** Crisp pixel stop square */
export function PixelStopIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="3" y="3" width="10" height="10" />
    </PixelSvg>
  );
}

/** Crisp pixel repeat / loop arrows */
export function PixelRepeatIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="3" y="3" width="8" height="2" />
      <rect x="10" y="1" width="2" height="6" />
      <rect x="12" y="2" width="2" height="4" />
      <rect x="14" y="3" width="1" height="2" />
      <rect x="2" y="5" width="2" height="3" />
      <rect x="5" y="11" width="8" height="2" />
      <rect x="4" y="9" width="2" height="6" />
      <rect x="2" y="10" width="2" height="4" />
      <rect x="1" y="11" width="1" height="2" />
      <rect x="12" y="8" width="2" height="3" />
    </PixelSvg>
  );
}

/** Crisp pixel reset / undo arrow */
export function PixelResetIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="2" width="6" height="2" />
      <rect x="3" y="4" width="2" height="2" />
      <rect x="2" y="2" width="2" height="5" />
      <rect x="2" y="5" width="5" height="2" />
      <rect x="11" y="4" width="2" height="7" />
      <rect x="5" y="12" width="6" height="2" />
      <rect x="3" y="10" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel lightbulb for tips & hints */
export function PixelLightbulbIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="1" width="6" height="2" />
      <rect x="3" y="3" width="2" height="5" />
      <rect x="11" y="3" width="2" height="5" />
      <rect x="5" y="8" width="2" height="2" />
      <rect x="9" y="8" width="2" height="2" />
      <rect x="5" y="10" width="6" height="2" />
      <rect x="6" y="13" width="4" height="2" />
      <rect x="7" y="4" width="2" height="3" />
    </PixelSvg>
  );
}

/** Crisp pixel X cross */
export function PixelCrossIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="2" y="2" width="2" height="2" />
      <rect x="4" y="4" width="2" height="2" />
      <rect x="6" y="6" width="4" height="4" />
      <rect x="10" y="4" width="2" height="2" />
      <rect x="12" y="2" width="2" height="2" />
      <rect x="4" y="10" width="2" height="2" />
      <rect x="2" y="12" width="2" height="2" />
      <rect x="10" y="10" width="2" height="2" />
      <rect x="12" y="12" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel magnifying glass */
export function PixelSearchIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="4" y="1" width="5" height="2" />
      <rect x="2" y="3" width="2" height="5" />
      <rect x="9" y="3" width="2" height="5" />
      <rect x="4" y="8" width="5" height="2" />
      <rect x="9" y="9" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
      <rect x="13" y="13" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel puzzle block for grammar & phrase tiles */
export function PixelPuzzleIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="6" y="1" width="4" height="2" />
      <rect x="3" y="3" width="10" height="2" />
      <rect x="3" y="5" width="2" height="8" />
      <rect x="11" y="5" width="2" height="3" />
      <rect x="13" y="6" width="2" height="4" />
      <rect x="11" y="10" width="2" height="3" />
      <rect x="3" y="12" width="10" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel keyboard */
export function PixelKeyboardIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="1" y="3" width="14" height="2" />
      <rect x="1" y="5" width="2" height="7" />
      <rect x="13" y="5" width="2" height="7" />
      <rect x="1" y="11" width="14" height="2" />
      <rect x="4" y="6" width="2" height="2" />
      <rect x="7" y="6" width="2" height="2" />
      <rect x="10" y="6" width="2" height="2" />
      <rect x="5" y="9" width="6" height="1" />
    </PixelSvg>
  );
}

/** Crisp pixel eye for answer reveal */
export function PixelEyeIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="3" width="6" height="2" />
      <rect x="3" y="5" width="2" height="2" />
      <rect x="11" y="5" width="2" height="2" />
      <rect x="1" y="7" width="2" height="2" />
      <rect x="13" y="7" width="2" height="2" />
      <rect x="3" y="9" width="2" height="2" />
      <rect x="11" y="9" width="2" height="2" />
      <rect x="5" y="11" width="6" height="2" />
      <rect x="6" y="6" width="4" height="4" />
    </PixelSvg>
  );
}

/** Crisp pixel bullseye / target for score badge */
export function PixelTargetIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="1" width="6" height="2" />
      <rect x="3" y="3" width="2" height="2" />
      <rect x="11" y="3" width="2" height="2" />
      <rect x="1" y="5" width="2" height="6" />
      <rect x="13" y="5" width="2" height="6" />
      <rect x="3" y="11" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
      <rect x="5" y="13" width="6" height="2" />
      <rect x="6" y="6" width="4" height="4" />
    </PixelSvg>
  );
}

/** Crisp pixel speech-bubble translate icon */
export function PixelTranslateIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="2" y="2" width="12" height="2" />
      <rect x="1" y="4" width="2" height="6" />
      <rect x="13" y="4" width="2" height="6" />
      <rect x="2" y="10" width="4" height="2" />
      <rect x="8" y="10" width="6" height="2" />
      <rect x="4" y="12" width="2" height="2" />
      <rect x="6" y="11" width="2" height="2" />
      <rect x="5" y="6" width="6" height="1" />
      <rect x="5" y="8" width="4" height="1" />
    </PixelSvg>
  );
}

/** Crisp pixel flame for streak */
export function PixelFlameIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="7" y="1" width="2" height="3" />
      <rect x="6" y="4" width="4" height="2" />
      <rect x="4" y="6" width="8" height="3" />
      <rect x="3" y="9" width="10" height="3" />
      <rect x="4" y="12" width="8" height="2" />
      <rect x="6" y="14" width="4" height="1" />
    </PixelSvg>
  );
}

/** Crisp pixel clock for deadline timelines */
export function PixelClockIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="1" width="6" height="2" />
      <rect x="3" y="3" width="2" height="2" />
      <rect x="11" y="3" width="2" height="2" />
      <rect x="1" y="5" width="2" height="6" />
      <rect x="13" y="5" width="2" height="6" />
      <rect x="3" y="11" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
      <rect x="5" y="13" width="6" height="2" />
      <rect x="7" y="4" width="2" height="5" />
      <rect x="9" y="7" width="3" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel envelope / mail icon */
export function PixelMailIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="1" y="3" width="14" height="2" />
      <rect x="1" y="5" width="2" height="7" />
      <rect x="13" y="5" width="2" height="7" />
      <rect x="1" y="12" width="14" height="2" />
      <rect x="3" y="5" width="2" height="2" />
      <rect x="5" y="7" width="2" height="2" />
      <rect x="7" y="8" width="2" height="2" />
      <rect x="9" y="7" width="2" height="2" />
      <rect x="11" y="5" width="2" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel microphone */
export function PixelMicIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="6" y="1" width="4" height="7" />
      <rect x="4" y="5" width="2" height="4" />
      <rect x="10" y="5" width="2" height="4" />
      <rect x="5" y="9" width="6" height="2" />
      <rect x="7" y="11" width="2" height="2" />
      <rect x="4" y="13" width="8" height="2" />
    </PixelSvg>
  );
}

/** Crisp pixel 3x3 grid for collapsible question map */
export function PixelGridIcon(props: PixelIconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="2" y="2" width="3" height="3" />
      <rect x="6" y="2" width="4" height="3" />
      <rect x="11" y="2" width="3" height="3" />
      <rect x="2" y="6" width="3" height="4" />
      <rect x="6" y="6" width="4" height="4" />
      <rect x="11" y="6" width="3" height="4" />
      <rect x="2" y="11" width="3" height="3" />
      <rect x="6" y="11" width="4" height="3" />
      <rect x="11" y="11" width="3" height="3" />
    </PixelSvg>
  );
}
