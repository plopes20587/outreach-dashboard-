export default function ContactCard({ contact, selected, onSelect }) {
  const initials = contact.name
    ? contact.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div
      className={`contact-card${selected ? " selected" : ""}`}
      onClick={onSelect}
    >
      <div className="contact-avatar">{initials}</div>

      <div className="contact-card-body">
        <div className="contact-name">{contact.name}</div>
        {contact.title && (
          <div className="contact-title-text">{contact.title}</div>
        )}
        {contact.email && (
          <div className="contact-email-text">{contact.email}</div>
        )}
        {contact.snippet && (
          <div className="contact-snippet-text">{contact.snippet}</div>
        )}
        {contact.linkedin && (
          <a
            href={contact.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="contact-linkedin-link"
            onClick={(e) => e.stopPropagation()}
          >
            LinkedIn
          </a>
        )}
      </div>

      <div className="contact-card-right">
        {contact.contact_type && (
          <span className="badge badge-neutral">{contact.contact_type}</span>
        )}
        {selected && (
          <span className="badge badge-blue">Selected</span>
        )}
      </div>
    </div>
  );
}
