import { appendFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const taskPathArg = process.argv.find((arg) => arg.startsWith("@") && arg.endsWith("task.md"));
if (!taskPathArg) throw new Error("missing private task file");
const taskArg = readFileSync(taskPathArg.slice(1), "utf8").trim();
const packet = JSON.parse(taskArg.slice("AILI task packet:".length).trim());
if (process.env.AILI_FIXTURE_LOG) appendFileSync(process.env.AILI_FIXTURE_LOG, `${process.pid}:${packet.taskId}\n`);
if (process.env.AILI_ARGS_LOG) appendFileSync(process.env.AILI_ARGS_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);

const emit = (summary, evidence = [`pid=${process.pid}`], wrapper = (value) => value) => {
  const result = {
    status: "completed",
    summary,
    evidence,
    changedFiles: [],
    verification: ["fixture"],
    blockers: [],
    risks: [],
    confidence: "HIGH"
  };
  const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: wrapper(JSON.stringify(result)) }] } };
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

if (packet.task === "MALFORMED") {
  process.stdout.write("not-json\n");
  process.exit(0);
}
if (packet.task === "OVERSIZE") {
  process.stdout.write(`${"x".repeat(70 * 1024)}\n`);
  process.exit(0);
}
if (packet.task === "FAIL") {
  process.stderr.write(`failure token=${process.env.AILI_SEEDED_SECRET ?? "none"}\n`);
  process.exit(7);
}
if (packet.task === "CANCEL") {
  const descendant = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  if (process.env.AILI_DESCENDANT_PID) appendFileSync(process.env.AILI_DESCENDANT_PID, String(descendant.pid));
  setInterval(() => {}, 1000);
} else if (packet.task === "CANCEL_STRONG") {
  const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" });
  if (process.env.AILI_DESCENDANT_PID) appendFileSync(process.env.AILI_DESCENDANT_PID, String(descendant.pid));
  process.on("SIGTERM", () => process.exit(0));
  setInterval(() => {}, 1000);
} else if (packet.task === "SLOW") {
  setTimeout(() => emit(packet.task), 250);
} else if (packet.task === "POLICY") {
  const policy = JSON.parse(readFileSync(process.env.AILI_CHILD_POLICY_FILE, "utf8"));
  emit(packet.task, [`tools=${policy.allowedTools.join(",")}`, `mode=${policy.mode}`]);
} else if (packet.task === "ECHO_ENV") {
  emit(process.env.AILI_SEEDED_SECRET ?? "missing");
} else if (packet.task === "TRUNCATED_AFTER_SUCCESS") {
  emit("premature-success");
  for (let index = 0; index < 205; index += 1) process.stdout.write(`${JSON.stringify({ type: "status", index })}\n`);
} else if (packet.task === "FENCED_JSON") {
  emit(packet.task, undefined, (value) => `\`\`\`json\n${value}\n\`\`\``);
} else if (packet.task === "INVALID_SHAPE") {
  const event = { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ status: "complete", confidence: "high" }) }] } };
  process.stdout.write(`${JSON.stringify(event)}\n`);
} else if (packet.task === "LOWERCASE_CONFIDENCE") {
  const result = { status: "completed", summary: packet.task, evidence: [], changedFiles: [], verification: [], blockers: [], risks: [], confidence: "high" };
  process.stdout.write(`${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify(result) }] } })}\n`);
} else if (packet.task === "MODEL_VARIANTS") {
  const result = { status: "success", summary: packet.task, evidence: [{ path: "package.json", claim: "package name" }], changedFiles: [], verification: "read-only", blockers: [], risks: [], confidence: "high" };
  process.stdout.write(`${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify(result) }] } })}\n`);
} else if (packet.task === "AGENT_END_ONLY") {
  const result = { status: "completed", summary: packet.task, evidence: ["agent-end"], changedFiles: [], verification: ["fixture"], blockers: [], risks: [], confidence: "HIGH" };
  process.stdout.write(`${JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", content: [{ type: "text", text: JSON.stringify(result) }] }] })}\n`);
} else if (packet.task === "SETTLED_DELTAS") {
  const result = JSON.stringify({ status: "completed", summary: packet.task, evidence: ["settled-deltas"], changedFiles: [], verification: ["fixture"], blockers: [], risks: [], confidence: "HIGH" });
  process.stdout.write(`${JSON.stringify({ type: "message_start", message: { role: "assistant", content: [] } })}\n`);
  for (const delta of [result.slice(0, 40), result.slice(40)]) process.stdout.write(`${JSON.stringify({ type: "message_update", message: { role: "assistant", content: [] }, assistantMessageEvent: { type: "text_delta", delta } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "fixture" }] } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`);
} else {
  emit(packet.task);
}
