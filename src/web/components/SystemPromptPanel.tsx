type Translate = (key: string, params?: Record<string, string | number>) => string;

export function SystemPromptPanel({ loading, prompt, translate }: {
  loading: boolean;
  prompt: string | null;
  translate: Translate;
}) {
  return (
    <section className="system-prompt-panel" aria-label={translate("system.prompt")}>
      <div className="system-prompt-scroll">
        {prompt ? (
          <div className="system-prompt-text">{prompt}</div>
        ) : (
          <div className="system-prompt-empty">
            {prompt === "" ? translate("system.empty") : loading ? translate("system.loading") : translate("system.load")}
          </div>
        )}
      </div>
    </section>
  );
}
