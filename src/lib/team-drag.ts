export const TEAM_DRAG_MIME = "application/x-basket-team";

export type TeamDragPayload = {
  id: string;
  name: string;
  competition: string;
};

let transparentDragImage: HTMLImageElement | null = null;

function getTransparentDragImage() {
  if (!transparentDragImage) {
    transparentDragImage = new window.Image(1, 1);
    transparentDragImage.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }

  return transparentDragImage;
}

// The browser's native drag preview is a translucent snapshot; hide it and
// carry a live clone of the card under the cursor instead. Returns the cleanup
// to run on dragend.
export function beginTeamCardDrag(
  event: React.DragEvent,
  card: HTMLElement,
): () => void {
  event.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);

  const rect = card.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "fixed";
  ghost.style.left = "0px";
  ghost.style.top = "0px";
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "400";
  ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  ghost.style.willChange = "transform";
  // dragover reports the cursor in discrete steps; a short transition
  // interpolates between them so the carried card glides instead of jumping.
  ghost.style.transition = "transform 80ms linear, opacity 120ms ease";
  // Scale from the grab point so the shrunken card stays under the cursor.
  ghost.style.transformOrigin = `${offsetX}px ${offsetY}px`;
  ghost.style.boxShadow = "0 24px 64px rgba(28, 13, 16, 0.28)";
  document.body.appendChild(ghost);

  let latestX = rect.left;
  let latestY = rect.top;
  let cursorY = event.clientY;
  let overDropTarget = false;
  let frame: number | null = null;

  // Native drags block wheel scrolling, so a card grabbed far down the page
  // could never reach the league tabs. Holding the cursor near the viewport's
  // top or bottom edge scrolls the page (speed grows toward the edge); the
  // ghost is position: fixed, so it stays under the cursor while scrolling.
  const SCROLL_EDGE = 140;
  const SCROLL_MAX_SPEED = 24;
  let scrollLoop: number | null = null;

  const autoScroll = () => {
    const viewportHeight = window.innerHeight;
    let delta = 0;

    if (cursorY < SCROLL_EDGE) {
      delta = -Math.ceil(((SCROLL_EDGE - cursorY) / SCROLL_EDGE) * SCROLL_MAX_SPEED);
    } else if (cursorY > viewportHeight - SCROLL_EDGE) {
      delta = Math.ceil(
        ((cursorY - (viewportHeight - SCROLL_EDGE)) / SCROLL_EDGE) *
          SCROLL_MAX_SPEED,
      );
    }

    if (delta) {
      window.scrollBy(0, delta);
    }

    scrollLoop = window.requestAnimationFrame(autoScroll);
  };

  scrollLoop = window.requestAnimationFrame(autoScroll);

  const moveGhost = (dragEvent: DragEvent) => {
    // Some browsers fire a final (0, 0) event when the drag ends.
    if (dragEvent.clientX === 0 && dragEvent.clientY === 0) {
      return;
    }

    latestX = dragEvent.clientX - offsetX;
    latestY = dragEvent.clientY - offsetY;
    cursorY = dragEvent.clientY;
    // The ghost has pointer-events: none, so this hits what is underneath it.
    // Over a drop target the card tucks in like a file dropped on a folder,
    // leaving the tab row visible instead of covered by the full-size card.
    overDropTarget = Boolean(
      document
        .elementFromPoint(dragEvent.clientX, dragEvent.clientY)
        ?.closest("[data-team-drop-target]"),
    );

    frame ??= window.requestAnimationFrame(() => {
      frame = null;
      ghost.style.transform = `translate(${latestX}px, ${latestY}px)${
        overDropTarget ? " scale(0.18)" : ""
      }`;
      ghost.style.opacity = overDropTarget ? "0.7" : "1";
    });
  };

  document.addEventListener("dragover", moveGhost);
  card.style.opacity = "0.35";

  return () => {
    document.removeEventListener("dragover", moveGhost);
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }
    if (scrollLoop !== null) {
      window.cancelAnimationFrame(scrollLoop);
    }
    ghost.remove();
    card.style.opacity = "";
  };
}

export function parseTeamDragPayload(raw: string): TeamDragPayload | null {
  try {
    const value: unknown = JSON.parse(raw);

    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as TeamDragPayload).id === "string" &&
      typeof (value as TeamDragPayload).name === "string" &&
      typeof (value as TeamDragPayload).competition === "string"
    ) {
      return value as TeamDragPayload;
    }
  } catch {
    // Not a team drag; ignore.
  }

  return null;
}
