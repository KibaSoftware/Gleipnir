import { appendRunEvent } from "../ledger.js";

const [cwd, runId, countText, workerId] = process.argv.slice(2);

if (cwd === undefined || runId === undefined || countText === undefined || workerId === undefined) {
  throw new Error("Expected cwd, run ID, count, and worker ID.");
}

const count = Number.parseInt(countText, 10);

for (let index = 0; index < count; index += 1) {
  appendRunEvent(cwd, runId, {
    type: "repository_state_changed",
    createdAt: new Date().toISOString(),
    repositoryFingerprint: `repo-${workerId}-${index}`,
    taskRevision: 1,
    payload: { workerId, index }
  });
}
