declare module "cross-spawn" {
  import type { ChildProcess, SpawnOptions } from "node:child_process";

  interface TypedChildProcess extends ChildProcess {
    on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  interface CrossSpawn {
    (command: string, args?: readonly string[], options?: SpawnOptions): TypedChildProcess;
    sync: typeof import("node:child_process").spawnSync;
  }

  const spawn: CrossSpawn;
  export default spawn;
}
