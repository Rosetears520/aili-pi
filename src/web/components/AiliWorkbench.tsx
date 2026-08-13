"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { WorkbenchCatalogV1, WorkbenchSessionV1 } from "@/contracts";
import { GatewayClient } from "@/gateway-client";
import { resolveLocale, translate, type WorkbenchLocale } from "@/i18n";
import { browserFilesToMediaInputs, mediaInputsFromDataTransfer, toOfficialPiImageContent, validateBrowserMedia, type ValidatedBrowserImage } from "@/media";
import { acceptRuntimeSnapshot, applyRuntimeEvent, inspectMcpProjection, projectWorkbenchRuntime, runtimeStatusView, type AcceptedRuntimeState } from "@/runtime-projection";
import { branchForkExplanation, buildSessionTree, composerActions, groupSessionsByProject, safeWorktreeRemovalArguments, type SessionTreeNodeV1, type WorkbenchAction } from "@/workbench-model";

export interface AiliWorkbenchProps { readonly gateway?: GatewayClient; }
type InspectorTab = "resources" | "agents" | "mcp";
type ResourceTab = "files" | "worktrees" | "skills" | "plugins" | "commands";

export function AiliWorkbench({ gateway: suppliedGateway }: AiliWorkbenchProps) {
  const gateway = useMemo(() => suppliedGateway ?? new GatewayClient(), [suppliedGateway]);
  const [catalog, setCatalog] = useState<WorkbenchCatalogV1 | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<AcceptedRuntimeState | null>(null);
  const [locale, setLocale] = useState<WorkbenchLocale>("en");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("resources");
  const [resourceTab, setResourceTab] = useState<ResourceTab>("files");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState<readonly ValidatedBrowserImage[]>([]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [loginPhrase, setLoginPhrase] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeSelection = useRef<string | null>(null);

  const selectSession = useCallback((handle: string | null) => {
    activeSelection.current = handle;
    setSelectedHandle(handle);
    setRuntime(null);
    setMedia([]);
    setErrors([]);
  }, []);

  const tr = useCallback((key: Parameters<typeof translate>[1]) => translate(locale, key), [locale]);
  const selectedSession = useMemo(() => findSession(catalog, selectedHandle), [catalog, selectedHandle]);
  const modelSupportsImages = useMemo(() => {
    if (!catalog || !runtime) return false;
    const pi = projectWorkbenchRuntime(runtime).pi;
    return catalog.models.some((model) => model.provider === pi.provider && model.modelId === pi.model && model.imageInput);
  }, [catalog, runtime]);

  const loadCatalog = useCallback(async () => {
    setErrors([]);
    try {
      const next = await gateway.catalog();
      setLoginRequired(false);
      setCatalog(next);
      const first = next.projects.flatMap((project) => project.sessions)[0];
      setSelectedHandle((current) => {
        const selected = current && findSession(next, current) ? current : first?.handle ?? null;
        activeSelection.current = selected;
        return selected;
      });
    } catch (error) {
      const message = messageOf(error);
      setLoginRequired(/same-site-session-required|access-denied|login-denied|bootstrap-unavailable/.test(message));
      setErrors([message]);
    }
  }, [gateway]);

  const synchronize = useCallback(async (handle: string, cursor?: string) => {
    try {
      const connected = await gateway.connect(handle, cursor);
      let accepted = acceptRuntimeSnapshot(connected.snapshot);
      if (connected.replay.kind === "reset") {
        const replacement = await gateway.connect(handle);
        accepted = acceptRuntimeSnapshot(replacement.snapshot);
      } else {
        for (const event of connected.replay.events ?? []) {
          const result = applyRuntimeEvent(accepted, event);
          accepted = result.state;
          if (result.kind === "reset-required") break;
        }
      }
      if (activeSelection.current === handle) setRuntime(accepted);
    } catch (error) {
      if (activeSelection.current !== handle) return;
      setRuntime((current) => current ? Object.freeze({ ...current, connection: "offline" }) : null);
      setErrors((current) => appendError(current, messageOf(error)));
    }
  }, [gateway]);

  useEffect(() => { setLocale(resolveLocale(globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? "en"])); void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { if (selectedHandle) void synchronize(selectedHandle); else setRuntime(null); }, [selectedHandle, synchronize]);
  useEffect(() => {
    if (modelSupportsImages || media.length === 0) return;
    setMedia([]);
    setErrors((current) => appendError(current, "The selected model does not accept image input; attachments were removed"));
  }, [media.length, modelSupportsImages]);
  const runtimeEpoch = runtime?.snapshot.runtimeEpoch;
  useEffect(() => {
    if (!selectedHandle || !runtimeEpoch) return;
    let subscription: ReturnType<GatewayClient["subscribe"]> | undefined;
    try {
      subscription = gateway.subscribe(selectedHandle, undefined, {
        onSnapshot: (snapshot) => {
          if (activeSelection.current !== selectedHandle) return;
          setRuntime((current) => current && current.snapshot.runtimeEpoch === snapshot.runtimeEpoch
            && current.snapshot.lastSequence >= snapshot.lastSequence ? current : acceptRuntimeSnapshot(snapshot));
        },
        onEvent: (event) => {
          setRuntime((current) => {
            if (!current || current.snapshot.sessionHandle !== selectedHandle) return current;
            const result = applyRuntimeEvent(current, event);
            if (result.kind === "reset-required") void synchronize(selectedHandle);
            return result.state;
          });
        },
        onReset: () => { void synchronize(selectedHandle); },
        onError: () => setRuntime((current) => current ? Object.freeze({ ...current, connection: "reconnecting" }) : current),
      });
    } catch (error) {
      setRuntime((current) => current ? Object.freeze({ ...current, connection: "reconnecting" }) : current);
      setErrors((current) => appendError(current, messageOf(error)));
    }
    return () => subscription?.close();
  // A sequence update must not recreate EventSource; epoch/selection changes do.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, runtimeEpoch, selectedHandle, synchronize]);

  const mutate = useCallback(async (action: WorkbenchAction, args: Record<string, import("@/contracts").JsonValue>) => {
    if (!runtime || busy) return;
    setBusy(true); setErrors([]);
    try {
      const projection = projectWorkbenchRuntime(runtime);
      const result = await gateway.mutate(action, runtime.snapshot, projection.pi.leafId, args);
      if (result.disposition !== "completed") throw new Error(result.reason);
      await synchronize(runtime.snapshot.sessionHandle, runtime.snapshot.cursor);
      if (action === "send" || action === "queue-next" || action === "steer") { setMessage(""); setMedia([]); }
      if (["new-session", "rename-session", "delete-session", "fork"].includes(action)) await loadCatalog();
    } catch (error) { setErrors([messageOf(error)]); }
    finally { setBusy(false); }
  }, [busy, gateway, loadCatalog, runtime, synchronize]);

  const attachFiles = useCallback(async (files: readonly Blob[]) => {
    try {
      const inputs = await browserFilesToMediaInputs(files);
      const result = validateBrowserMedia(inputs, { modelSupportsImages });
      setErrors(result.failures.map((failure) => `${failure.name}: ${failure.message}`));
      setMedia((current) => [...current, ...result.accepted].slice(0, 10));
    } catch (error) { setErrors([messageOf(error)]); }
  }, [modelSupportsImages]);

  const submit = useCallback((action: "send" | "queue-next" | "steer") => {
    if ((!message.trim() && media.length === 0) || !runtime) return;
    const images = toOfficialPiImageContent(media);
    void mutate(action, { message: message.trim(), ...(images.length ? { images: images as unknown as import("@/contracts").JsonValue } : {}) });
  }, [media, message, mutate, runtime]);

  if (!catalog) return <main className="loading-shell"><h1>{tr("appName")}</h1>{loginRequired ? <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setErrors([]); void gateway.login(loginPhrase).then(() => { setLoginPhrase(""); return loadCatalog(); }).catch((error) => setErrors([messageOf(error)])).finally(() => setBusy(false)); }}><label>Access password<input type="password" autoComplete="current-password" value={loginPhrase} onChange={(event) => setLoginPhrase(event.target.value)} minLength={12} maxLength={1024} required /></label><button type="submit" disabled={busy}>Log in</button></form> : <p>{tr("loading")}</p>}{errors.length > 0 && <Errors errors={errors} />}</main>;
  const projects = groupSessionsByProject(catalog);
  const projection = runtime ? projectWorkbenchRuntime(runtime) : null;
  const status = runtime ? runtimeStatusView(runtime) : null;
  const composer = runtime ? composerActions(runtime) : null;
  const selectedModel = projection ? catalog.models.find((model) => model.provider === projection.pi.provider && model.modelId === projection.pi.model) : undefined;

  return (
    <main className="workbench-shell" onDragOver={(event) => { if (hasImageDrag(event)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); void attachFiles(Array.from(event.dataTransfer.files)); }}>
      <header className="topbar">
        <button className="icon-button" onClick={() => setLeftOpen((value) => !value)} aria-label={tr("sessions")} aria-pressed={leftOpen}>☰</button>
        <strong>{tr("appName")}</strong>
        <span className="topbar-spacer" />
        <button className="icon-button" onClick={() => setRightOpen((value) => !value)} aria-label={tr("inspector")} aria-pressed={rightOpen}>◫</button>
        <button className="icon-button" onClick={() => { setBusy(true); void gateway.logout().then(() => { activeSelection.current = null; setSelectedHandle(null); setCatalog(null); setRuntime(null); setLoginRequired(true); }).catch((error) => setErrors([messageOf(error)])).finally(() => setBusy(false)); }} aria-label="Log out" disabled={busy}>⇥</button>
        <select aria-label="Language" value={locale} onChange={(event) => setLocale(event.target.value as WorkbenchLocale)}><option value="en">English</option><option value="zh-CN">简体中文</option></select>
      </header>

      <div className="workbench-grid" data-left-open={leftOpen} data-right-open={rightOpen}>
        {leftOpen && <aside className="session-sidebar" aria-label={tr("sessions")}>
          <div className="panel-heading"><h2>{tr("sessions")}</h2><span className="panel-actions"><button disabled={!runtime || busy || runtime.snapshot.capabilities["session.create"] !== true || !status?.writable} onClick={() => selectedSession && void mutate("new-session", { projectHandle: selectedSession.projectHandle })} aria-label="New session">＋</button><button onClick={() => void loadCatalog()} aria-label={tr("retry")}>↻</button></span></div>
          <div className="session-scroll">{projects.map((project) => <ProjectTree key={project.handle} project={project} selected={selectedHandle} onSelect={selectSession} />)}</div>
          {selectedSession && <SessionActions session={selectedSession} gateway={gateway} busy={busy || !status?.writable} tr={tr} onAction={(action, args) => void mutate(action, args)} />}
        </aside>}

        <section className="timeline-column" aria-label={tr("timeline")}>
          <div className="timeline-heading">
            <div><h1>{selectedSession?.name ?? tr("noSession")}</h1>{selectedSession?.branchLabel && <span className="badge">{selectedSession.branchLabel}</span>}</div>
            {runtime?.snapshot.writer.owner === "tui" && <span className="observer-badge">{tr("observer")}</span>}
          </div>
          <div className="timeline" role="feed" aria-busy={projection?.pi.activeRun ?? false}>
            {(selectedSession?.timeline ?? []).map((item) => <article key={item.id} className={`timeline-item kind-${item.kind}`} aria-label={`${item.kind}: ${item.title}`}>
              <div className="timeline-meta"><span>{item.kind}</span><span>{item.status}</span>{item.at && <time dateTime={item.at}>{new Date(item.at).toLocaleString(locale)}</time>}</div>
              <h3>{item.title}</h3>{item.body && <pre>{item.body}</pre>}
              {item.media?.map((entry) => <img key={entry.id} src={entry.url} alt={entry.label} loading="lazy" />)}
            </article>)}
            {selectedSession && selectedSession.timeline.length === 0 && <p className="empty-state">No projected timeline entries</p>}
          </div>
          {errors.length > 0 && <Errors errors={errors} />}
          <form className="composer" onSubmit={(event) => { event.preventDefault(); if (composer) submit(composer.primary.action as "send" | "queue-next"); }} onPaste={(event) => { const files = mediaInputsFromDataTransfer(Array.from(event.clipboardData.items)); if (files.length) { event.preventDefault(); void attachFiles(files); } }}>
            {media.length > 0 && <div className="attachment-row">{media.map((image, index) => <figure key={`${image.name}-${index}`}><img src={image.previewUrl} alt={image.name} /><figcaption>{image.name}</figcaption><button type="button" onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${tr("remove")} ${image.name}`}>×</button></figure>)}</div>}
            <textarea value={message} maxLength={32_768} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => handleComposerKey(event, composer?.primary.action as "send" | "queue-next" | undefined, submit)} placeholder={runtime?.snapshot.writer.owner === "tui" ? tr("observer") : composer?.primary.effect ?? tr("noSession")} disabled={!runtime || Boolean(composer?.disabledReason)} />
            <div className="composer-controls">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(event) => { void attachFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={!modelSupportsImages || Boolean(composer?.disabledReason)}>{tr("media")}</button>
              <span className="composer-spacer" />
              {composer?.secondary && <button type="button" className="steer-button" title={composer.secondary.effect} disabled={busy || Boolean(composer.disabledReason)} onClick={() => submit("steer")}>{tr("steer")}</button>}
              <button type="submit" className="primary-button" title={composer?.primary.effect} disabled={busy || !composer || Boolean(composer.disabledReason) || (!message.trim() && media.length === 0)}>{composer?.primary.action === "queue-next" ? tr("queueNext") : tr("send")}</button>
            </div>
            {composer?.disabledReason && <p className="composer-reason" role="status">{composer.disabledReason}</p>}
          </form>
        </section>

        {rightOpen && <aside className="inspector" aria-label={tr("inspector")}>
          <nav className="tabs" aria-label={tr("inspector")}>{(["resources", "agents", "mcp"] as const).map((tab) => <button key={tab} aria-selected={inspectorTab === tab} onClick={() => setInspectorTab(tab)}>{tr(tab)}</button>)}</nav>
          {inspectorTab === "agents" && <AgentInspector projection={projection} onContinue={(handle) => void mutate("agent-continue", { agentHandle: handle })} tr={tr} />}
          {inspectorTab === "mcp" && <McpInspector runtime={runtime} tr={tr} />}
          {inspectorTab === "resources" && <ResourceInspector catalog={catalog} selectedFile={selectedFile} setSelectedFile={setSelectedFile} resourceTab={resourceTab} setResourceTab={setResourceTab} busy={busy || !status?.writable} onMutate={(action, args) => void mutate(action, args)} tr={tr} />}
        </aside>}
      </div>

      <footer className="runtime-status" aria-label={tr("status")} aria-live="polite">
        <StatusCell label={tr("connection")} value={status?.connection ?? "offline"} />
        <StatusCell label={tr("writer")} value={status?.writer ?? "Unavailable"} />
        <StatusCell label={tr("model")} value={status?.model ?? "Unavailable"} />
        <StatusCell label={tr("thinking")} value={status?.thinking ?? "Unavailable"} />
        <StatusCell label={tr("context")} value={status?.context ?? "Unavailable"} />
        <StatusCell label={tr("activeRun")} value={status?.activeRun ? projection?.pi.runLabel ?? "Running" : "Idle"} />
        <StatusCell label={tr("agents")} value={status?.agent ?? "Unavailable"} />
        <StatusCell label={tr("mcp")} value={status?.mcp ?? "Unavailable"} />
        <StatusCell label="AILI" value={projection ? [projection.analyticsAvailable && "Analytics", projection.stampAvailable && "Stamp", projection.btwAvailable && "BTW", projection.worktreeAvailable && "Worktree"].filter(Boolean).join(" · ") || "Unavailable" : "Unavailable"} />
        {runtime && <select aria-label={tr("model")} value={selectedModel ? JSON.stringify([selectedModel.provider, selectedModel.modelId]) : ""} disabled={busy || !status?.writable} onChange={(event) => { const selected = JSON.parse(event.target.value) as [string, string]; void mutate("select-model", { provider: selected[0], modelId: selected[1] }); }}><option value="">{tr("model")}</option>{catalog.models.map((model) => <option key={`${model.provider}:${model.modelId}`} value={JSON.stringify([model.provider, model.modelId])}>{model.label}</option>)}</select>}
        {runtime && <select aria-label={tr("thinking")} value={projection?.pi.thinkingLevel ?? ""} disabled={busy || !status?.writable} onChange={(event) => void mutate("select-thinking", { thinkingLevel: event.target.value })}><option value="">{tr("thinking")}</option>{(selectedModel?.thinkingLevels ?? []).map((level) => <option key={level} value={level}>{level}</option>)}</select>}
      </footer>
    </main>
  );
}

function ProjectTree({ project, selected, onSelect }: { project: import("@/contracts").WorkbenchProjectV1; selected: string | null; onSelect(handle: string): void }) {
  const tree = buildSessionTree(project.sessions);
  return <section className="project-group"><h3>{project.label}</h3>{tree.map((node) => <SessionNode key={node.session.handle} node={node} selected={selected} onSelect={onSelect} depth={0} />)}</section>;
}
function SessionNode({ node, selected, onSelect, depth }: { node: SessionTreeNodeV1; selected: string | null; onSelect(handle: string): void; depth: number }) {
  return <><button className="session-row" data-selected={selected === node.session.handle} style={{ paddingInlineStart: 10 + depth * 14 }} title={`Resume ${node.session.name}`} aria-label={`Resume ${node.session.name}`} onClick={() => onSelect(node.session.handle)}><span>{node.session.running ? "●" : "○"}</span><span>{node.session.name}</span><small>{node.session.messageCount}</small></button>{node.children.map((child) => <SessionNode key={child.session.handle} node={child} selected={selected} onSelect={onSelect} depth={depth + 1} />)}</>;
}
function SessionActions({ session, gateway, busy, tr, onAction }: { session: WorkbenchSessionV1; gateway: GatewayClient; busy: boolean; tr: (key: Parameters<typeof translate>[1]) => string; onAction(action: WorkbenchAction, args: Record<string, import("@/contracts").JsonValue>): void }) {
  return <div className="session-actions">
    <button disabled={!session.actions.branch || busy} title={branchForkExplanation("branch")} onClick={() => onAction("branch", { sessionHandle: session.handle })}>{tr("branch")}</button>
    <button disabled={!session.actions.fork || busy} title={branchForkExplanation("fork")} onClick={() => onAction("fork", { sessionHandle: session.handle })}>{tr("fork")}</button>
    <button disabled={!session.actions.rename || busy} onClick={() => { const name = globalThis.prompt?.("Session name", session.name)?.trim(); if (name) onAction("rename-session", { sessionHandle: session.handle, name }); }}>{tr("rename")}</button>
    <a aria-disabled={!session.actions.export} href={session.actions.export ? gateway.exportUrl(session.handle) : undefined}>{tr("export")}</a>
    <button className="danger" disabled={!session.actions.safeDelete || busy} onClick={() => { if (globalThis.confirm?.("Delete this persisted session?")) onAction("delete-session", { sessionHandle: session.handle }); }}>{tr("safeDelete")}</button>
  </div>;
}
function AgentInspector({ projection, onContinue, tr }: { projection: ReturnType<typeof projectWorkbenchRuntime> | null; onContinue(handle: string): void; tr: (key: Parameters<typeof translate>[1]) => string }) {
  if (!projection?.agents.length) return <p className="empty-state">{tr("emptyAgents")}</p>;
  return <div className="resource-list">{projection.agents.map((agent) => <article key={agent.handle}><h3>{agent.label}</h3><span className="badge">{agent.state}</span>{agent.summary && <p>{agent.summary}</p>}<button disabled={!agent.continuationAllowed} onClick={() => onContinue(agent.handle)}>Continue</button></article>)}</div>;
}
function McpInspector({ runtime, tr }: { runtime: AcceptedRuntimeState | null; tr: (key: Parameters<typeof translate>[1]) => string }) {
  if (!runtime) return <p className="empty-state">{tr("emptyMcp")}</p>;
  const inspection = inspectMcpProjection(runtime);
  return <div><p className="truth-note">{tr("mcpLazy")}</p>{inspection.servers.length === 0 ? <p className="empty-state">{tr("emptyMcp")}</p> : <div className="resource-list">{inspection.servers.map((server) => <article key={server.handle}><h3>{server.label}</h3><span className="badge">{server.state}</span><p>{server.lazy ? "Lazy" : "Eager"}{server.toolCount !== undefined ? ` · ${server.toolCount} tools` : ""}</p>{server.errorCategory && <p role="alert">{server.errorCategory}</p>}</article>)}</div>}</div>;
}
function ResourceInspector({ catalog, selectedFile, setSelectedFile, resourceTab, setResourceTab, busy, onMutate, tr }: { catalog: WorkbenchCatalogV1; selectedFile: string | null; setSelectedFile(value: string): void; resourceTab: ResourceTab; setResourceTab(value: ResourceTab): void; busy: boolean; onMutate(action: WorkbenchAction, args: Record<string, import("@/contracts").JsonValue>): void; tr: (key: Parameters<typeof translate>[1]) => string }) {
  const file = catalog.files.find((item) => item.handle === selectedFile);
  return <div><nav className="subtabs">{(["files", "worktrees", "skills", "plugins", "commands"] as const).map((tab) => <button key={tab} aria-selected={resourceTab === tab} onClick={() => setResourceTab(tab)}>{tr(tab)}</button>)}</nav>
    {resourceTab === "files" && <div className="resource-split"><div className="resource-list">{catalog.files.map((item) => <button key={item.handle} onClick={() => setSelectedFile(item.handle)}><span>{item.kind === "directory" ? "▸" : "·"} {item.label}</span>{item.gitState && <small>{item.gitState}</small>}</button>)}</div>{file && <article className="file-preview"><h3>{file.label}</h3>{file.diff ? <pre className="diff-preview">{file.diff}</pre> : file.preview ? <pre>{file.preview}</pre> : file.mediaUrl ? <FileMediaPreview file={file} /> : <p>No bounded preview</p>}</article>}</div>}
    {resourceTab === "worktrees" && <div className="resource-list">{catalog.worktrees.map((item) => <article key={item.handle}><h3>{item.label}</h3><p>{item.branch ?? "detached"} · {item.main ? "main" : item.current ? "current" : item.dirty ? "dirty" : "clean"}</p><button disabled={busy || item.current} onClick={() => onMutate("worktree-switch", { worktreeHandle: item.handle })}>Switch</button><button className="danger" disabled={busy || !item.removable} title={item.denialReason} onClick={() => onMutate("worktree-remove", { ...safeWorktreeRemovalArguments(item.handle) })}>Remove safely</button></article>)}</div>}
    {resourceTab === "skills" && <div className="resource-list">{catalog.skills.map((item) => <article key={item.handle}><h3>{item.label}</h3><p>{item.description}</p><button disabled={busy || !item.mutable} onClick={() => onMutate("toggle-skill", { skillHandle: item.handle, enabled: !item.enabled })}>{item.enabled ? "Disable" : "Enable"}</button></article>)}</div>}
    {resourceTab === "plugins" && <div className="resource-list">{catalog.plugins.map((item) => <article key={item.handle}><h3>{item.label}</h3><p>{item.scope} · {item.state}</p><button disabled={busy || !item.mutable} onClick={() => onMutate("plugin-action", { pluginHandle: item.handle, action: item.state === "disabled" ? "enable" : "disable" })}>{item.state === "disabled" ? "Enable" : "Disable"}</button></article>)}</div>}
    {resourceTab === "commands" && <div className="resource-list">{catalog.commands.map((item) => <article key={item.handle}><h3>/{item.label}</h3><p>{item.description}</p><span className="badge">{item.source}</span></article>)}</div>}
  </div>;
}
function FileMediaPreview({ file }: { file: import("@/contracts").FileResourceV1 }) {
  if (!file.mediaUrl) return null;
  if (file.kind === "image") return <img src={file.mediaUrl} alt={file.label} loading="lazy" />;
  if (file.kind === "audio") return <audio src={file.mediaUrl} controls preload="metadata" aria-label={file.label} />;
  if (file.kind === "pdf" || file.kind === "docx") return <iframe src={file.mediaUrl} sandbox={file.kind === "docx" ? "allow-same-origin" : undefined} title={`Preview ${file.label}`} />;
  return <p>No bounded preview</p>;
}
function StatusCell({ label, value }: { label: string; value: string }) { return <div className="status-cell"><small>{label}</small><strong>{value}</strong></div>; }
function Errors({ errors }: { errors: readonly string[] }) { return <div className="error-shelf" role="alert">{errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>; }
function findSession(catalog: WorkbenchCatalogV1 | null, handle: string | null): WorkbenchSessionV1 | undefined { return catalog?.projects.flatMap((project) => project.sessions).find((session) => session.handle === handle); }
function appendError(current: readonly string[], error: string): readonly string[] { return [...current.filter((item) => item !== error).slice(-4), error]; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function hasImageDrag(event: DragEvent): boolean { return Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/")); }
function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>, action: "send" | "queue-next" | undefined, submit: (action: "send" | "queue-next" | "steer") => void): void { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && action) { event.preventDefault(); submit(action); } }
