import { Type } from "typebox";
import { resolveFormalTaskBoardRoot } from "../formal-task-board-root.js";
import { parseFormalTaskBoard, type FormalTaskBoard } from "../formal-task-board.js";
import { buildFormalPackageTaskRequest } from "../formal-orchestration.js";
import type { FormalTaskRequest } from "../formal-orchestration.js";

// The formal_task adapter: validate the exact v1 board/progress pair, select
// one ready package, and construct the ordinary persistent-agent task request
// from board fields only. An invalid pair fails here before any Agent/job/turn
// allocation — ordinary task/hub dispatch is never affected.

export const FORMAL_TASK_TOOL_SCHEMA = Type.Object({
  changeId: Type.String({ minLength: 1, description: "Exact OpenSpec change id owning the formal-task-board.md/progress.txt pair." }),
  packageId: Type.String({ minLength: 1, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$", description: "Exact package id of one ready Agent-owned package on that board." }),
}, { additionalProperties: false });

export interface FormalTaskDispatchInput {
  changeId: string;
  packageId: string;
}

export async function buildFormalTaskDispatch(repositoryRoot: string, input: FormalTaskDispatchInput): Promise<FormalTaskRequest> {
  const changeId = input.changeId.trim();
  const packageId = input.packageId.trim();
  if (!changeId) throw new Error("formal_task requires a changeId");
  if (!packageId) throw new Error("formal_task requires a packageId");

  const resolution = await resolveFormalTaskBoardRoot({
    repositoryRoot,
    identity: { state: "resolved", changeId },
  });
  if (resolution.status !== "resolved") {
    const codes = resolution.diagnostics.map((entry) => entry.code).join(", ") || "UNKNOWN";
    throw new Error(`formal_task '${changeId}' failed exact v1 root validation: ${codes}`);
  }
  if (resolution.pairState !== "present") {
    throw new Error(`formal_task '${changeId}' requires an existing valid v1 formal-task-board.md/progress.txt pair`);
  }
  const parsed = parseFormalTaskBoard(resolution.tasksSource);
  if (parsed.classification !== "v1" || !parsed.board) {
    throw new Error(`formal_task '${changeId}' board did not parse as an exact v1 formal-task-board`);
  }
  const board: FormalTaskBoard = parsed.board;
  const taskPackage = board.packages.find((candidate) => candidate.id === packageId);
  if (!taskPackage) {
    throw new Error(`formal_task package '${packageId}' is not on the validated board '${changeId}'`);
  }
  const status = taskPackage.fields.Status?.value ?? "";
  if (status !== "ready") {
    throw new Error(`formal_task package '${packageId}' has status '${status || "unknown"}'; only a ready package can be dispatched`);
  }
  const request = buildFormalPackageTaskRequest(board, {
    taskIdentity: board.headers["Task identity"]?.value ?? changeId,
    phase: board.headers.Phase?.value ?? "",
  }, packageId);
  if (!request) throw new Error(`formal_task package '${packageId}' is not on the validated board '${changeId}'`);
  return request;
}
