import { useState } from "react";

// Card supports three header modes:
//   1. No header        -> pass neither title nor collapsible
//   2. Plain title       -> pass `title` (used by the always-visible Contact card)
//   3. Collapsible title -> pass `collapsible` + `title` (used by the optional helper panels)
//
// Collapsible cards can be left uncontrolled (Card tracks its own open/closed
// state via `defaultOpen`) OR controlled by the parent (pass `open` + `onToggle`).
// The LinkedIn tab controls them so it can auto-open a panel after, say, a JD
// analysis finishes.
export default function Card({
  title,
  optional,
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
          <span className="card-title">{title}</span>
          {optional && <span className="card-optional">Optional</span>}
        </button>
      ) : (
        title && (
          <div className="card-header">
            <span className="card-title">{title}</span>
            {optional && <span className="card-optional">Optional</span>}
          </div>
        )
      )}
      {showBody && children}
    </div>
  );
}
