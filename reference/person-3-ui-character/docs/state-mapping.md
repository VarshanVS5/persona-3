# State mapping tables (implemented in `apps/desktop-ui/src/lib/outcome.ts` and `eventReducer.ts`)

## Task status to character state

| Backend status | Character | Notes |
|---|---|---|
| none | idle (listening if a voice partial transcript is arriving) | |
| QUEUED, PLANNING | thinking | |
| AWAITING_CONFIRMATION | approval_required | |
| RUNNING, VERIFYING, CANCELLING | executing | |
| SUCCEEDED | success only if every step has `verification_passed` and the app is not in Mock mode; otherwise idle | Text says "not fully verified" |
| FAILED, PARTIAL | error | |
| CANCELLED | cancelled | |
| anything else | error | |

Success, error and cancelled poses return to idle after 5 s. The Result panel keeps the text.

## Event to step state

| Event | Effect |
|---|---|
| plan_ready (valid) | steps created, all pending |
| plan_ready (invalid) | plan and approval removed, "Plan could not be validated" |
| step_started | pending to running |
| verification_passed | running to completed (this is the only evidence of "verified") |
| verification_failed | running to failed, reason kept (500 chars max) |
| task_cancelled | pending and running to cancelled; completed and failed unchanged |
| unknown type, schemaVersion other than 1.0, other taskId, duplicate | ignored (diagnostic recorded except for duplicates and other tasks) |

## Outcome label

| Condition | Label |
|---|---|
| request sent, nothing started | requested |
| a step started, not all verified, no terminal event | attempted (not yet verified) |
| SUCCEEDED and every step verified | verified |
| SUCCEEDED but a step lacks verification | completed, "reported complete - verification evidence missing" |
| FAILED, or a failed step | failed |
| PARTIAL | failed, noted "partial" |
| CANCELLED | cancelled |
