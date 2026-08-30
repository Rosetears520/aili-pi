import type { ReactNode } from "react";

/** Read-only settings/catalog presentation. Data and lifecycle stay with the caller. */
export function SettingsUi({ title, subtitle, sections }: {
  title: string;
  subtitle?: string;
  sections: ReadonlyArray<{ id: string; label: string; content: ReactNode }>;
}) {
  return (
    <section className="settings-ui" aria-label={title}>
      <header className="settings-ui-header"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</header>
      <div className="settings-ui-body">
        {sections.map((section) => <section className="settings-ui-section" key={section.id}><h3>{section.label}</h3><div>{section.content}</div></section>)}
      </div>
    </section>
  );
}
