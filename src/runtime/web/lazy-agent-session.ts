/**
 * Lazy bridge to the official Pi AgentSession. The browser never imports Pi's
 * runtime while it merely lists/reads JSONL. A compatible mutation path asks a
 * supplied official factory to materialise a session only after admission.
 */
export interface OfficialAgentSessionLike {
  readonly id?: string;
  dispose?: () => void | Promise<void>;
}

export interface OfficialAgentSessionFactory<T extends OfficialAgentSessionLike = OfficialAgentSessionLike> {
  create(sessionId: string): Promise<T> | T;
}

export interface LazyAgentSessionOptions<T extends OfficialAgentSessionLike> {
  readonly sessionId: string;
  readonly factory: OfficialAgentSessionFactory<T>;
  readonly compatible: () => boolean;
}

export class LazyOfficialAgentSession<T extends OfficialAgentSessionLike = OfficialAgentSessionLike> {
  private value?: T;
  private loading?: Promise<T>;
  private disposed = false;

  public constructor(private readonly options: LazyAgentSessionOptions<T>) {}

  public get loaded(): boolean {
    return this.value !== undefined;
  }

  public async get(): Promise<T> {
    if (this.disposed) throw new Error("official AgentSession bridge is disposed");
    if (!this.options.compatible()) throw new Error("official Pi 0.84.1 compatibility is required before session mutation");
    if (this.value) return this.value;
    this.loading ??= Promise.resolve(this.options.factory.create(this.options.sessionId)).then((value) => {
      if (!value || typeof value !== "object") throw new Error("official AgentSession factory returned an invalid session");
      if (this.disposed) {
        return Promise.resolve((value as T & { dispose?: () => void | Promise<void> }).dispose?.()).then((): T => {
          throw new Error("official AgentSession bridge was disposed while loading");
        });
      }
      this.value = value;
      return value;
    }).finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  public async dispose(): Promise<void> {
    if (this.disposed && !this.value && !this.loading) return;
    this.disposed = true;
    const loading = this.loading;
    if (loading) await loading.catch(() => undefined);
    const value = this.value as (T & { dispose?: () => void | Promise<void> }) | undefined;
    this.value = undefined;
    this.loading = undefined;
    await value?.dispose?.();
  }
}

export const OFFICIAL_PI_VERSION = "0.84.1" as const;

export function isOfficialPiCompatible(version: unknown): version is typeof OFFICIAL_PI_VERSION {
  return version === OFFICIAL_PI_VERSION;
}

export function assertOfficialPiCompatible(version: unknown): asserts version is typeof OFFICIAL_PI_VERSION {
  if (!isOfficialPiCompatible(version)) throw new Error(`unsupported Pi runtime ${String(version)}; expected ${OFFICIAL_PI_VERSION}`);
}
