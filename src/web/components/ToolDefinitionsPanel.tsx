"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolEntry } from "@/lib/tool-presets";
import { getToolParameterFields } from "@/lib/tool-definition-fields";

export { getToolParameterFields } from "@/lib/tool-definition-fields";
export type { ToolParameterField } from "@/lib/tool-definition-fields";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function ToolDefinitionsPanel({ loading, tools, translate }: { loading: boolean; tools: ToolEntry[] | null; translate: Translate }) {
  const activeTools = useMemo(() => tools?.filter((tool) => tool.active) ?? null, [tools]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  useEffect(() => setSelectedName((current) => activeTools?.some((tool) => tool.name === current) ? current : activeTools?.[0]?.name ?? null), [activeTools]);
  const selected = activeTools?.find((tool) => tool.name === selectedName) ?? activeTools?.[0] ?? null;
  const fields = selected ? getToolParameterFields(selected.parameters) : [];
  const empty = activeTools ? translate("tools.noTools") : loading ? translate("tools.loading") : translate("tools.load");

  return (
    <div className="tool-definitions-panel">
      <nav className="tool-definitions-sidebar" aria-label={translate("tools.title")}>
        <div className="tool-definitions-list">
          {activeTools?.length ? activeTools.map((tool) => (
            <button key={tool.name} type="button" className={`tool-definitions-item${tool.name === selected?.name ? " selected" : ""}`} aria-pressed={tool.name === selected?.name} onClick={() => setSelectedName(tool.name)}><code>{tool.name}</code></button>
          )) : <div className="tool-definitions-empty">{empty}</div>}
        </div>
      </nav>
      <section className="tool-definition-detail" aria-label={translate("tools.details")}>
        {selected ? <div className="tool-definition-scroll">
          {selected.description && <section className="tool-definition-section"><div className="tool-definition-section-label">{translate("tools.description")}</div><div className="tool-definition-description">{selected.description}</div></section>}
          <section className="tool-definition-section">
            <div className="tool-definition-section-label"><span>{translate("tools.parameters")}</span><span>{translate("tools.parameterCount", { count: fields.length })}</span></div>
            {fields.length ? <div className="tool-definition-fields">{fields.map((field) => <div className="tool-definition-field" key={field.name}>
              <div className="tool-definition-field-name"><code>{field.name}</code><span className={field.required ? "required" : undefined}>{translate(field.required ? "tools.required" : "tools.optional")}</span></div>
              <div className="tool-definition-field-value"><code className="tool-definition-type">{field.type}</code>{field.description && <div>{field.description}</div>}{field.allowedValues && <div className="tool-definition-meta">{translate("tools.allowedValues")}: <code>{field.allowedValues}</code></div>}{field.defaultValue !== undefined && <div className="tool-definition-meta">{translate("tools.defaultValue")}: <code>{field.defaultValue}</code></div>}</div>
            </div>)}</div> : <div className="tool-definition-no-parameters">{translate("tools.noParameters")}</div>}
          </section>
          {selected.promptGuidelines?.length ? <section className="tool-definition-section"><div className="tool-definition-section-label">{translate("tools.guidelines")}</div><ul className="tool-definition-guidelines">{selected.promptGuidelines.map((item, index) => <li key={`${selected.name}:${index}`}>{item}</li>)}</ul></section> : null}
        </div> : <div className="tool-definitions-empty">{empty}</div>}
      </section>
    </div>
  );
}
