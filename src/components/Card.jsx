import { useState } from "react";

// Card supports three header modes:
//   1. No header         -> pass neither title nor collapsible
//   2. Plain title       -> pass `title` (what all four flow cards use)
//   3. Collapsible title -> pass `collapsible` + `title`
//
// `step` and `done` render the numbered step chip in the header, which turns
// green once that step has produced something. That chip is the app's only
// progress affordance: at full width all four cards are on screen at once, so a
// separate progress rail would only restate what the headers already show.
//
// `note` is a right-aligned provenance pill ("From Acme Corp", "Hunter.io"). It
// answers the question the old layout could not: where did this card's contents
// come from? That is what makes one step visibly feed the next.
export default function Card({
  title,
  step,
  done = false,
  note,
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onToggle,
  children,
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : openState;

  function handleToggle() {
    if (isControlled) onToggle?.(!isOpen);
    else setOpenState((prev) => !prev);
  }

  const showBody = collapsible ? isOpen : true;

  const stepChip = step != null && (
    <span className={`card-step${done ? " done" : ""}`} aria-label={done ? "Step complete" : undefined}>
      {done ? "✓" : step}
    </span>
  );

  return (
    <div className="card">
      {collapsible ? (
        <button
          type="button"
          className="card-header card-header-toggle"
          onClick={handleToggle}
          aria-expanded={isOpen}
        >
          <span className={`card-chevron${isOpen ? " open" : ""}`} aria-hidden="true">
            &#9656;
          </span>
          {stepChip}
          <span className="card-title">{title}</span>
          {note && <span className="card-note">{note}</span>}
        </button>
      ) : (
        title && (
          <div className="card-header">
            {stepChip}
            <span className="card-title">{title}</span>
            {note && <span className="card-note">{note}</span>}
          </div>
        )
      )}
      {showBody && <div className="card-body">{children}</div>}
    </div>
  );
}
