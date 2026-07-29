// Six lucide shapes repeat once per team card, so at 195 cards their inline
// path data was 45% of the /teams document (~493 kB). Define each shape once as
// a <symbol> and reference it with <use>: the per-card cost drops to the outer
// <svg> plus a href. Path data is copied verbatim from lucide-react 0.577.0 so
// the rendering is pixel-identical.
//
// The sprite must live in the page shell, outside every Suspense boundary —
// <use href="#id"> resolves against the live document, so defs arriving after
// the cards would flash empty icons.

export type TeamCardIconName =
  | "globe"
  | "instagram"
  | "external-link"
  | "shield-alert"
  | "map-pinned"
  | "user-round";

const SYMBOL_ID_PREFIX = "tc-icon-";

export function TeamCardIconSprite() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute overflow-hidden">
      <symbol
        id={`${SYMBOL_ID_PREFIX}globe`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </symbol>
      <symbol
        id={`${SYMBOL_ID_PREFIX}instagram`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </symbol>
      <symbol
        id={`${SYMBOL_ID_PREFIX}external-link`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </symbol>
      <symbol
        id={`${SYMBOL_ID_PREFIX}shield-alert`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </symbol>
      <symbol
        id={`${SYMBOL_ID_PREFIX}map-pinned`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0" />
        <circle cx="12" cy="8" r="2" />
        <path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712" />
      </symbol>
      <symbol
        id={`${SYMBOL_ID_PREFIX}user-round`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </symbol>
    </svg>
  );
}

export function TeamCardIcon({
  name,
  className,
}: {
  name: TeamCardIconName;
  className?: string;
}) {
  return (
    <svg aria-hidden="true" className={className}>
      <use href={`#${SYMBOL_ID_PREFIX}${name}`} />
    </svg>
  );
}
