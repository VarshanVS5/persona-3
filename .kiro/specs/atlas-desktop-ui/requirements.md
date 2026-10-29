# Requirements Document

## Introduction

This document specifies the Windows desktop UI for Project ATLAS (Autonomous Task Layer for Application Systems), owned by Person 3 (UI and Animated Character). The UI is React + TypeScript (Vite) rendered inside the Tauri 2 shell in `apps/desktop-ui`. It lets a user enter a request, review the plan the backend produces, approve consequential actions, watch real execution state, cancel, and inspect verified results and a redacted local audit journal.

Boundaries inherited from `docs/prd/00-master-prd.md`, `docs/prd/01-common-team-execution-prd.md`, `docs/api-contract.md`, `docs/architecture.md`, and `docs/decisions.md`:

- The UI is not a security boundary. The Backend (`services/atlas-core`, `127.0.0.1:8765`) owns policy, authorization, execution, and verification (Person 1), planning and providers (Person 2), and integration and QA (Person 4). The UI displays plans and relays approvals and cancellations. The UI never executes LLM output and never performs Windows automation.
- The UI consumes the contract in `packages/contracts/` (task plan, `AtlasEvent` v1.0, `TaskStatus`) and the REST and SSE endpoints in `docs/api-contract.md`. Endpoint field names beyond Common PRD 4.4 are PROPOSED, so the Atlas_Client isolates them in one module.
- `docs/prd/04-person-3-ui-character-prd.md` is still a placeholder. This document and the Master PRD sections 11 and 12 are the working source of truth until that PRD is supplied.
- `src-tauri/tauri.conf.json` (bundle, identifier, signing) needs project-owner approval per D9. Changes to it are proposed, not assumed.
- No endpoint currently exists for the audit journal, settings, or provider status. The UI reads what the Backend exposes, shows "unavailable" where an endpoint is missing, and records each gap as an integration point.

Delivery is a six-hour hackathon, so the first priority is a demonstrable vertical slice: command, plan preview, approval, live timeline, verified result, cancel, and a visible Mock_Mode versus Live_Mode distinction.

## Glossary

- **Desktop_UI**: The React + TypeScript application in `apps/desktop-ui`, including the Tauri shell.
- **Tauri_Shell**: The Tauri 2 native host that provides the window, icon, and local persistence.
- **Backend**: The local Python service in `services/atlas-core` reached at `http://127.0.0.1:8765`.
- **Atlas_Client**: The module `atlasClient.ts` that calls the Backend REST endpoints and consumes the SSE event stream.
- **Mock_Client**: The module `mockClient.ts` that serves fixtures from `packages/contracts/examples/` without any Backend.
- **Mock_Mode**: A UI mode in which Mock_Client supplies all data and nothing is executed on the machine.
- **Live_Mode**: A UI mode in which Atlas_Client talks to the Backend and the Backend reports `mockMode: false`.
- **Backend_Mock_Mode**: The state where the Backend reports `mockMode: true` on `/api/v1/health`. Execution is simulated by the Backend and is distinct from Mock_Mode.
- **Mode_Indicator**: The persistent visible element that states Mock_Mode, Backend_Mock_Mode, Live_Mode, or Disconnected.
- **Command_Composer**: The typed text input and submit control for user requests.
- **Voice_Input**: The microphone control and transcript preview, shown only when speech integration is reported available.
- **Plan**: A `TaskPlan` per `task-plan.schema.json`.
- **Plan_Digest**: The `planDigest` string from `plan_ready` or `confirmation_required` events identifying the exact reviewed Plan.
- **Plan_Inspector**: The component that shows the Plan summary, ordered steps, risk tiers, targets, and confirmation requirement.
- **Approval_Control**: The explicit approve and reject controls for a Plan or step that requires confirmation.
- **Execution_Timeline**: The ordered live view of step states, with each step in one of pending, running, completed, failed, or cancelled.
- **Outcome_State**: One of requested, attempted, completed, verified, failed, or cancelled, derived only from Backend events and status.
- **Result_Panel**: The component that shows the final Outcome_State, evidence, error messages, and recovery guidance.
- **Character**: The original source-code-driven 2D SVG/CSS animated character.
- **Character_State**: One of idle, listening, thinking, executing, approval_required, success, error, cancelled.
- **Audit_Journal_View**: The screen showing journal entries obtained from the Backend with secrets redacted.
- **Redactor**: The UI utility that masks secret-like values before text is rendered, stored, or logged.
- **Settings_Store**: The persisted, non-secret UI settings kept in the Tauri_Shell local app data.
- **Settings_Screen**: The screen for providers, permissions, execution preferences, and diagnostics.
- **First_Launch_Flow**: The guided setup shown when no valid Settings_Store exists.
- **About_View**: The screen showing identity, version, privacy disclosure, and troubleshooting.
- **Reduced_Motion**: The `prefers-reduced-motion: reduce` operating system preference.
- **Event_Reducer**: The pure function that folds `AtlasEvent` items into UI state.
- **Installer**: The `.msi` or `.exe` package produced by Tauri.

## Requirements

### Requirement 1: Native Windows desktop window

**User Story:** As a Windows user, I want ATLAS to behave like a normal desktop application, so that I can manage it like any other window.

#### Acceptance Criteria

1. THE Tauri_Shell SHALL present Desktop_UI in a native window with minimize, maximize, restore, and close controls.
2. WHEN the user resizes the window to any width from 960 px to 3840 px and any height from 600 px to 2160 px, THE Desktop_UI SHALL reflow its layout within 200 ms of the resize ending, with no horizontal scrollbar and no clipped or overlapping interactive controls.
3. THE Tauri_Shell SHALL prevent the window from being resized below 960 px width or 600 px height.
4. WHEN the user closes the window while a task is in RUNNING, VERIFYING, or CANCELLING status, THE Desktop_UI SHALL keep the window open and show a confirmation dialog that displays the active task's identifier and command text, with a confirm option and a dismiss option.
5. WHEN the user dismisses the confirmation dialog, THE Desktop_UI SHALL close the dialog, keep the window open, and leave the active task status unchanged.
6. WHEN the user confirms closing during an active task, THE Desktop_UI SHALL send a cancel request to the Backend before the window closes.
7. WHEN the Backend accepts the cancel request within 3 seconds of the request being sent, THE Desktop_UI SHALL close the window.
8. IF the Backend does not accept the cancel request within 3 seconds of the request being sent, or the cancel request fails with an error, THEN THE Desktop_UI SHALL close the window and record in the Audit_Journal_View an entry stating that cancellation was not confirmed, including the task identifier and a timestamp.
9. WHEN the user closes the window while no task is in RUNNING, VERIFYING, or CANCELLING status, THE Desktop_UI SHALL close the window without showing a confirmation dialog.

### Requirement 2: Application identity and version

**User Story:** As a user, I want ATLAS to show a clear name, icon, and version, so that I can recognize the application and report issues accurately.

#### Acceptance Criteria

1. WHEN the Tauri_Shell main window opens, THE Tauri_Shell SHALL display the exact product name "Project ATLAS" and the application icon in the window title bar and the taskbar entry within 2 seconds of the window becoming visible.
2. WHEN the Installer runs, THE Installer SHALL display the exact product name "Project ATLAS" and the application icon on its welcome screen and in its installed-programs entry.
3. WHEN the user opens the About_View, THE About_View SHALL display the Desktop_UI version read from the build metadata, the Backend version, and the contract version `1.0`, each on a separate labeled line, within 1 second of opening.
4. IF the Backend reports a version, THEN THE About_View SHALL display it in the format "Backend version: <version>", using the reported value truncated to a maximum of 64 characters.
5. IF the Backend does not report a version, the Backend request fails, or the Backend does not respond within 3 seconds, THEN THE About_View SHALL display "Backend version: not reported" and SHALL continue to display the Desktop_UI version and the contract version.
6. THE Desktop_UI SHALL use only an application icon and character artwork that were created originally and are committed in the repository, with no third-party assets.

### Requirement 3: Persistent settings

**User Story:** As a user, I want my preferences to survive restarts, so that I do not reconfigure ATLAS every launch.

#### Acceptance Criteria

1. THE Settings_Store SHALL persist non-secret settings (execution preferences, display preferences, voice enablement, last-used mode) in the Tauri_Shell local app data directory.
2. WHEN Desktop_UI starts, THE Desktop_UI SHALL load the Settings_Store and apply the stored values before rendering the main view.
3. IF the Settings_Store file is missing, unreadable, or fails schema validation, THEN THE Desktop_UI SHALL start with documented defaults, display a notice indicating that settings were reset, and replace the invalid file with the defaults only after the notice is displayed.
4. THE Settings_Store SHALL exclude API keys, passwords, and tokens.
5. FOR ALL valid settings objects, serializing then parsing the Settings_Store content SHALL produce an equivalent settings object (round-trip property).
6. WHEN the user changes a setting, THE Settings_Store SHALL persist the new value within 1 second.
7. IF persisting a changed setting fails (for example, the disk is full or the directory is not writable), THEN THE Desktop_UI SHALL display an error notice indicating that the setting was not saved, within 2 seconds of the failure, AND THE Settings_Store SHALL retain the last successfully persisted file contents unchanged.
8. IF the Settings_Store file contains a value outside the allowed values for a setting, THEN THE Desktop_UI SHALL replace only that setting with its documented default, apply all other valid stored values, and display a notice naming the reset setting.

### Requirement 4: First-launch experience and configuration validation

**User Story:** As a first-time user, I want guided setup that checks my configuration, so that I know whether ATLAS is ready and in which mode.

#### Acceptance Criteria

1. IF no Settings_Store exists, or the Settings_Store cannot be read or fails schema validation, THEN THE Desktop_UI SHALL present the First_Launch_Flow before the main view and SHALL NOT display the main view until the First_Launch_Flow completes.
2. THE First_Launch_Flow SHALL display, before the mode choice is enabled, a list of each feature that uses cloud services and the categories of data transmitted for each, with text identical to the privacy disclosure in the About_View.
3. THE First_Launch_Flow SHALL present Mock_Mode and Live_Mode as unselected options and SHALL keep the continue action disabled until the user selects one of them.
4. WHEN the user selects Live_Mode, THE Desktop_UI SHALL call `GET /api/v1/health` and, within 500 ms of receiving the response, display the result including whether the Backend reports `mockMode`.
5. IF the Backend health check returns a non-success response, returns no response, or exceeds 5 seconds, THEN THE Desktop_UI SHALL display an error indicating the failure reason, offer retry and switch-to-Mock_Mode actions, and keep the user on the First_Launch_Flow without persisting the mode.
6. WHEN the Backend reports `mockMode: true` while the user selected Live_Mode, THE Desktop_UI SHALL display Backend_Mock_Mode in the Mode_Indicator.
7. IF the user enters a Backend host other than `127.0.0.1`, or a port that is not an integer from 1024 to 65535 inclusive, THEN THE First_Launch_Flow SHALL reject the value, display an error message naming the invalid field (host or port), and keep the previously entered valid values and the continue action disabled until both fields are valid.
8. THE Desktop_UI SHALL NOT request or store provider API keys.
9. WHEN the user completes the First_Launch_Flow with a selected mode, THE Desktop_UI SHALL persist the chosen mode, the validated host and port, and a first-launch-complete marker in the Settings_Store, and SHALL then display the main view.
10. IF persisting to the Settings_Store fails, THEN THE Desktop_UI SHALL display an error indicating the save failed, offer a retry action, and remain on the First_Launch_Flow without marking first launch complete.

### Requirement 5: Explicit separation of Mock_Mode, Backend_Mock_Mode, and Live_Mode

**User Story:** As a user, I want to always know whether actions are real, so that I never mistake simulated output for real results.

#### Acceptance Criteria

1. WHILE the Desktop_UI is running, THE Mode_Indicator SHALL be visible on every screen and SHALL display exactly one of "Mock mode (UI fixtures)", "Backend mock mode (simulated execution)", "Live mode", or "Disconnected".
2. WHEN the active mode changes, THE Mode_Indicator SHALL update to the new mode label within 500 ms.
3. WHILE Desktop_UI is in Mock_Mode, THE Desktop_UI SHALL label every plan, timeline entry, and result with the text "MOCK - nothing was executed".
4. WHILE the Mode_Indicator shows Backend_Mock_Mode, THE Desktop_UI SHALL label every plan, timeline entry, and result with the text "SIMULATED by backend".
5. WHILE Desktop_UI is in Mock_Mode, THE Desktop_UI SHALL NOT send any request to the Backend execution endpoint (`/confirm`).
6. WHEN the user switches between Mock_Mode and Live_Mode, THE Desktop_UI SHALL clear the current task view (plan, timeline, results, and pending confirmation), and SHALL NOT submit any request until the user enters a new one.
7. IF the Backend does not respond within 5 seconds or the connection is lost while in Live_Mode, THEN THE Desktop_UI SHALL set the Mode_Indicator to "Disconnected", SHALL display an error indication that the Backend is unreachable, SHALL retain the current task view as read-only, and SHALL NOT switch to Mock_Mode automatically.
8. WHILE Desktop_UI is in Mock_Mode, THE Desktop_UI SHALL display a banner and mode badge whose colors differ from the banner and badge colors used in Live_Mode.

### Requirement 6: Typed command composer

**User Story:** As a user, I want to type a request, so that I can use ATLAS without voice or cloud access.

#### Acceptance Criteria

1. WHEN the user submits a request that is non-empty after trimming leading and trailing whitespace and is 2000 characters or fewer, THE Command_Composer SHALL submit it to Atlas_Client as `POST /api/v1/tasks/plan` with body `{ "userRequest": string }`.
2. WHEN the user submits a valid request, THE Desktop_UI SHALL display the submitted text in the transcript with the Outcome_State "requested" within 200 milliseconds of submission.
3. IF the request is empty or contains only whitespace, THEN THE Command_Composer SHALL reject the submission without calling Atlas_Client, display a validation message indicating that the request is empty, and keep the composer input unchanged.
4. IF the request exceeds 2000 characters, THEN THE Command_Composer SHALL reject the submission without calling Atlas_Client, display the limit (2000) and the current length, and keep the typed text unchanged.
5. WHILE a task is not in a terminal status, THE Command_Composer SHALL disable the submit control and display a message stating that a task is still in progress and naming its current status.
6. WHILE Voice_Input is unavailable, THE Command_Composer SHALL allow the user to type, validate, and submit requests with the same behavior as when Voice_Input is available.
7. IF the plan request cannot reach Atlas_Client's service, receives no response within 15 seconds, or is rejected by the service, THEN THE Desktop_UI SHALL display the failure category (unreachable, timeout, or rejected), keep the typed text in the composer, and re-enable submission so the user can resubmit.
8. WHEN the user resubmits after a failed plan request, THE Command_Composer SHALL submit the retained text as a new plan request subject to criteria 1, 3, and 4.

### Requirement 7: Voice input interface

**User Story:** As a user with a working microphone, I want to dictate requests, so that I can use ATLAS hands-free when speech is available.

#### Acceptance Criteria

1. WHERE speech integration is reported available by the Backend or Settings_Store, THE Desktop_UI SHALL display the Voice_Input control and a listening-status indicator that shows one of three states: idle, listening, or error.
2. WHERE speech integration is not reported available, THE Desktop_UI SHALL hide the Voice_Input control and display "Voice unavailable - typed input is active" in the Settings_Screen diagnostics.
3. WHEN a `transcript` event with `source: "voice"` and `isFinal: false` arrives, THE Desktop_UI SHALL display the text as a partial transcript within 200 ms of event receipt and SHALL replace the previously displayed partial transcript with the new text.
4. WHEN a `transcript` event with `source: "voice"` and `isFinal: true` arrives, THE Desktop_UI SHALL place the text in the Command_Composer for user correction, SHALL clear the partial transcript display, and SHALL NOT submit the text automatically.
5. IF a `provider_error` event for `aws-transcribe` arrives, THEN THE Desktop_UI SHALL display the redacted message within 500 ms of event receipt, set the listening-status indicator to error, keep the Command_Composer enabled, and retain any text already present in the Command_Composer.
6. THE Voice_Input control SHALL be reachable with the Tab key and SHALL toggle listening on and off when the Enter key or Space key is pressed while the control has focus.
7. IF the Command_Composer already contains text when a final voice transcript arrives, THEN THE Desktop_UI SHALL append the transcript after the existing text, separated by one space, and SHALL NOT overwrite the existing text.

### Requirement 8: Plan preview before execution

**User Story:** As a user, I want to see exactly what ATLAS plans to do before it does anything, so that I can decide whether to proceed.

#### Acceptance Criteria

1. WHEN a `plan_ready` event arrives and the payload passes validation, THE Plan_Inspector SHALL display within 500 ms the Plan summary and every step in execution order, each showing `actionType`, arguments, `riskTier`, preconditions, postconditions, and `timeoutMs`.
2. WHEN a `plan_ready` event arrives and the payload passes validation, THE Plan_Inspector SHALL display the highest `riskTier` among all steps and a "confirmation required" or "confirmation not required" indicator as reported by the Backend.
3. THE Plan_Inspector SHALL render all Plan content, including arguments up to the maximum length received, as plain text, and SHALL NOT interpret HTML tags, markdown, or script in that content as markup or executable code.
4. WHEN a `plan_ready` event arrives with a Plan_Digest different from the one held for the same task, THE Desktop_UI SHALL discard any pending approval, disable the approval control until the user has viewed the updated Plan, and display "Plan changed - review again".
5. IF a `plan_ready` payload fails validation against `task-plan.schema.json`, THEN THE Desktop_UI SHALL reject the payload, discard any previously displayed Plan and pending approval for that task, display "Plan could not be validated", and expose no approval control for the task.
6. WHEN a `clarification_required` event arrives, THE Desktop_UI SHALL display the question and all provided options, and WHEN the user selects an option or submits a free-text answer of 1 to 500 characters, THE Desktop_UI SHALL send the answer to the Backend as a new plan request for the same task.
7. THE Plan_Inspector SHALL display risk tiers exactly as reported by the Backend and SHALL NOT provide a control that edits a tier, an action, or an argument.
8. IF a `clarification_required` event arrives with no options and the user submits an empty answer, THEN THE Desktop_UI SHALL not send a plan request and SHALL display a message indicating an answer is required.

### Requirement 9: Explicit approval controls

**User Story:** As a user, I want to approve or reject consequential actions explicitly, so that nothing risky runs without my consent.

#### Acceptance Criteria

1. WHEN a `confirmation_required` event arrives, THE Approval_Control SHALL display the Plan summary, the affected targets, the highest risk tier, and distinct Approve and Reject buttons within 500 ms of receiving the event.
2. WHEN the user activates Approve, THE Atlas_Client SHALL send `POST /api/v1/tasks/{taskId}/confirm` with the Plan_Digest of the exact Plan displayed.
3. THE Desktop_UI SHALL NOT send a confirm request unless the user activated Approve for the displayed Plan_Digest.
4. WHEN the user activates Reject, THE Atlas_Client SHALL send `POST /api/v1/tasks/{taskId}/cancel` and THE Desktop_UI SHALL display Outcome_State "cancelled" only after the Backend reports it.
5. IF the Backend rejects a confirm request because the Plan changed, THEN THE Desktop_UI SHALL display an error message indicating the Plan changed, display the new Plan with its Plan_Digest for review, and send no further confirm request until the user activates Approve again for the new Plan_Digest.
6. WHILE a confirm request is in flight, THE Approval_Control SHALL disable Approve to prevent duplicate submissions.
7. IF the highest risk tier is T2, THEN THE Approval_Control SHALL require a second explicit confirmation naming the affected targets before sending the confirm request.
8. IF the highest risk tier is T3, THEN THE Desktop_UI SHALL display the Plan as blocked-or-requires-separate-authorization and SHALL NOT offer an Approve button.
9. WHILE the Approval_Control is displayed, THE Desktop_UI SHALL move keyboard focus into it and return focus to the Command_Composer when it closes.
10. WHERE a plan does not require confirmation, THE Desktop_UI SHALL NOT display Approve and Reject controls.
11. IF a confirm or cancel request fails because the Backend is unreachable or does not respond within 10 seconds, THEN THE Desktop_UI SHALL display an error message indicating the request failed, re-enable Approve and Reject, and keep the displayed Plan unchanged.

### Requirement 10: Live execution timeline

**User Story:** As a user, I want to watch each step's real state, so that I understand what ATLAS is doing right now.

#### Acceptance Criteria

1. THE Execution_Timeline SHALL list every Plan step in Plan order, each with exactly one of the states pending, running, completed, failed, or cancelled, and SHALL show the state pending for every step before any event for that step has been applied.
2. WHEN a `step_started` event arrives for a step whose state is pending, THE Event_Reducer SHALL mark the matching step running within 200 milliseconds of the event being received.
3. WHEN a `verification_passed` event arrives for a step whose state is running, THE Event_Reducer SHALL mark the matching step completed within 200 milliseconds of the event being received.
4. WHEN a `verification_failed` event arrives for a step whose state is running, THE Event_Reducer SHALL mark the matching step failed and record the failure reason from the event, truncated to a maximum of 500 characters, within 200 milliseconds of the event being received.
5. WHEN a `task_cancelled` event arrives, THE Event_Reducer SHALL mark every step whose state is pending or running as cancelled and SHALL leave steps whose state is completed or failed unchanged.
6. THE Execution_Timeline SHALL derive step state only from Backend events and polled task state, and SHALL NOT display a percentage or progress bar that is not computed as the count of completed steps divided by the total count of Plan steps.
7. FOR ALL event sequences, THE Event_Reducer SHALL produce the same state when the same sequence is applied again from the initial state (determinism property).
8. FOR ALL event sequences containing duplicate events with identical `taskId`, `type`, `timestamp`, and payload, THE Event_Reducer SHALL produce the same state as the sequence with duplicates removed (idempotence property).
9. IF an event has an unknown `type`, a `schemaVersion` other than `1.0`, or fails envelope validation, THEN THE Event_Reducer SHALL leave all step states unchanged, record one diagnostic entry containing the reason for rejection, and keep at most the 100 most recent diagnostic entries.
10. IF an event arrives for a `taskId` other than the active task, THEN THE Event_Reducer SHALL leave the active task's step states unchanged and SHALL NOT display the event in the active task view.
11. WHEN the SSE stream disconnects, THE Atlas_Client SHALL start polling `GET /api/v1/tasks/{taskId}` at 2-second intervals and display "Reconnecting" within 1 second of the disconnect, and SHALL continue displaying the last known step states while polling.
12. WHEN the SSE stream or polling resumes after a disconnect, THE Event_Reducer SHALL reconcile state by applying the `events` array from `GET /api/v1/tasks/{taskId}` in order, SHALL remove the "Reconnecting" display once reconciliation completes, and SHALL treat events already applied as duplicates under criterion 8.
13. IF a poll of `GET /api/v1/tasks/{taskId}` fails or does not respond within 5 seconds, THEN THE Atlas_Client SHALL keep displaying "Reconnecting", retain the last known step states, and retry at the next 2-second interval.

### Requirement 11: Verifiable results, errors, and recovery guidance

**User Story:** As a user, I want results backed by evidence and clear next steps on failure, so that I can trust what ATLAS reports.

#### Acceptance Criteria

1. THE Result_Panel SHALL show the Outcome_State using only one of the labels requested, attempted, completed, verified, failed, and cancelled, and SHALL show exactly one Outcome_State at a time for each task.
2. WHEN a step has a `step_started` event but no `verification_passed` event, THE Result_Panel SHALL display that step as "attempted - not yet verified" within 500 ms of the most recent event for that step being received.
3. WHEN the Backend reports `SUCCEEDED` through a `task_completed` event and every step of the task has a `verification_passed` event, THE Result_Panel SHALL display "verified" within 500 ms of the `task_completed` event being received.
4. IF the Backend reports `SUCCEEDED` while one or more steps lack a `verification_passed` event, THEN THE Result_Panel SHALL display "reported complete - verification evidence missing", list the identifiers of the steps lacking evidence, and SHALL NOT display the "verified" label or any success indicator.
5. WHEN a `task_failed` or `verification_failed` event arrives, THE Result_Panel SHALL display the "failed" Outcome_State, the `reason` with secrets and credentials redacted, the failed step identifier, and the recovery guidance for the matching failure category, within 500 ms of the event being received.
6. WHEN the Backend reports `PARTIAL`, THE Result_Panel SHALL display "partial", list the steps with a `verification_passed` event under a completed-steps heading, and list all remaining steps under a separate unfinished-steps heading, so that each step appears in exactly one list.
7. THE Result_Panel SHALL provide recovery guidance from a documented table that maps each failure category (unreachable Backend, timeout, verification failed, policy blocked, provider error, cancelled) to one or more guidance texts, with at least one next-step action per category.
8. IF a failure event matches no category in the documented table, THEN THE Result_Panel SHALL display generic recovery guidance that tells the user to retry the task or review the Audit_Journal_View, and SHALL still display the redacted `reason` and failed step identifier when they are present.
9. WHERE the Backend event payload explicitly reports a verified compensation capability for an action, THE Result_Panel SHALL state that the action is reversible, and otherwise THE Result_Panel SHALL NOT state that any action is reversible.
10. WHILE no Backend event has been received for the current task, THE Result_Panel SHALL display no success indicator, and SHALL display no "verified" or "completed" label.

### Requirement 12: Safe cancellation and timeout handling

**User Story:** As a user, I want to stop a task and see honest cancellation status, so that I stay in control.

#### Acceptance Criteria

1. WHILE a task is in RUNNING, VERIFYING, or AWAITING_CONFIRMATION status, THE Desktop_UI SHALL display an enabled Cancel control that can be focused with the Tab key and activated with the Enter or Space key.
2. WHEN the user activates Cancel, THE Atlas_Client SHALL send `POST /api/v1/tasks/{taskId}/cancel` within 500 milliseconds, and THE Desktop_UI SHALL display "Cancellation requested" and disable the Cancel control until the request succeeds or fails.
3. WHEN the Backend reports `CANCELLING`, THE Desktop_UI SHALL display "Cancelling - the current action may still finish" within 1 second of receiving the report.
4. WHEN the Backend reports `CANCELLED` or emits `task_cancelled`, THE Desktop_UI SHALL display "Cancellation confirmed" within 1 second of receiving the report and SHALL disable the Cancel control.
5. WHILE the Backend has not reported `CANCELLED` or emitted `task_cancelled` for a task, THE Desktop_UI SHALL NOT display "Cancellation confirmed" for that task.
6. IF the cancel request returns an error response, a network failure occurs, or no response arrives within 5 seconds, THEN THE Desktop_UI SHALL display "Cancellation not confirmed", keep the task view active with its last known status and data unchanged, and display an enabled Retry cancel control.
7. IF no event or status update arrives for an active task within the configured inactivity timeout (default 30 seconds, allowed range 10 to 120 seconds), THEN THE Desktop_UI SHALL display "No update from backend" and display enabled Cancel and Retry-connection controls.
8. IF any request times out, THEN THE Desktop_UI SHALL NOT resubmit that request unless the user activates a retry control.
9. IF a timeout or network failure occurs on a confirm request, THEN THE Atlas_Client SHALL send `GET /api/v1/tasks/{taskId}` and THE Desktop_UI SHALL NOT enable a confirm retry control until that query returns a task status or fails.
10. IF the `GET /api/v1/tasks/{taskId}` query from criterion 9 returns a status showing the confirm was already applied, THEN THE Desktop_UI SHALL display that status and SHALL NOT offer a confirm retry; IF the query fails or exceeds 5 seconds, THEN THE Desktop_UI SHALL display an error indicating the task state is unknown and offer a retry of the query only.

### Requirement 13: Local audit journal view with secret redaction

**User Story:** As a user, I want to review a local record of what happened without exposing secrets, so that I can audit ATLAS activity safely.

#### Acceptance Criteria

1. WHEN the user opens the Audit_Journal_View, THE Audit_Journal_View SHALL list journal entries ordered by timestamp with the newest first, showing for each entry the timestamp, task identifier, event type, step identifier, and redacted detail.
2. WHERE the Backend exposes a journal endpoint, WHEN the user opens the Audit_Journal_View, THE Audit_Journal_View SHALL load entries from that endpoint and display them within 2 seconds of the Backend response, for up to 1,000 entries.
3. WHERE the Backend exposes no journal endpoint, WHEN the user opens the Audit_Journal_View, THE Audit_Journal_View SHALL list the events received by Desktop_UI in the current session and display the label "Session events (backend journal unavailable)".
4. IF the Backend journal endpoint request fails or does not respond within 5 seconds, THEN THE Audit_Journal_View SHALL list the events received by Desktop_UI in the current session, display the label "Session events (backend journal unavailable)", and display an error indication that the journal load failed.
5. THE Redactor SHALL replace every substring that matches a secret pattern (API keys, bearer tokens, passwords in key-value pairs, AWS access key identifiers, private key blocks) with a fixed mask token before the text is displayed, persisted, or logged.
6. FOR ALL strings, applying the Redactor twice SHALL produce the same output as applying it once (idempotence property).
7. FOR ALL strings containing a seeded secret value, THE Redactor output SHALL NOT contain the seeded secret value (secret non-leakage property).
8. WHEN the user sets a filter by task identifier, event type, or both, THE Audit_Journal_View SHALL display only entries whose task identifier equals the selected task identifier (exact match) and whose event type equals the selected event type (exact match), and SHALL display an empty-result indication if no entry matches.
9. WHEN the Desktop_UI writes a diagnostic log entry, THE Desktop_UI SHALL pass the entry text through the Redactor before writing it.

### Requirement 14: Settings screen

**User Story:** As a user, I want one place to review providers, permissions, preferences, and diagnostics, so that I understand and control how ATLAS behaves.

#### Acceptance Criteria

1. WHEN the Settings_Screen opens, THE Settings_Screen SHALL display the status of each provider (9Router, Amazon Transcribe, Amazon Polly) as exactly one of "enabled", "disabled", or "unknown", as reported by the Backend or Settings_Store.
2. IF the Backend and Settings_Store do not report a status for a provider, THEN THE Settings_Screen SHALL display "unknown" for that provider.
3. THE Settings_Screen SHALL display provider configuration guidance that refers to the Backend `.env` file and SHALL NOT contain an input field for API keys.
4. WHEN the Settings_Screen opens, THE Settings_Screen SHALL display the permission scope (allowlisted applications, approved directories, blocked action categories) as read from the Backend or `action-registry.json`, labeled read-only, with no editable controls for these values.
5. IF the Backend does not report allowlists, THEN THE Settings_Screen SHALL display "Not reported by backend" in place of each unreported allowlist and SHALL NOT display placeholder allowlist values.
6. THE Settings_Screen SHALL provide these execution preferences: inactivity timeout (integer, 10 to 120 seconds inclusive), reduced-motion override (on or off), and confirm-before-close-during-task (on or off).
7. IF the user enters an inactivity timeout that is not an integer from 10 to 120 inclusive, THEN THE Settings_Screen SHALL reject the value, display the permitted range "10 to 120 seconds" within 200 ms, and retain the previously saved value.
8. WHEN the user changes a valid execution preference, THE Settings_Screen SHALL save it to the Settings_Store and display the saved value within 500 ms.
9. THE Settings_Screen SHALL provide a diagnostics section showing Backend URL, health result with latency in milliseconds, `mockMode` value, event-stream status, and the most recent 20 diagnostic entries, each passed through the Redactor before display.
10. IF the Backend health check does not respond within 5 seconds or returns an error, THEN THE Settings_Screen SHALL display the health result as "unreachable" and show no latency value.
11. WHEN the user activates "Copy diagnostics", THE Desktop_UI SHALL pass the diagnostics text through the Redactor, copy the redacted text to the clipboard, and display a confirmation within 1 second.
12. IF copying to the clipboard fails, THEN THE Desktop_UI SHALL display an error message indicating the copy failed and SHALL NOT copy unredacted text.

### Requirement 15: About, version, and troubleshooting view

**User Story:** As a user, I want help and version information in the app, so that I can fix common problems and report issues.

#### Acceptance Criteria

1. WHEN the user opens the About_View, THE About_View SHALL display the product name, version, build date in YYYY-MM-DD format, and licence or ownership notice from build metadata within 500 ms.
2. IF any build metadata field is missing or unreadable, THEN THE About_View SHALL display the text "Unavailable" in place of that field, continue to display all other fields, and remain usable.
3. WHEN the user opens the About_View, THE About_View SHALL display a privacy disclosure that names each feature that uses 9Router, Amazon Transcribe, and Amazon Polly, and states that screenshots, clipboard contents, and document contents are not transmitted by default.
4. WHEN the user opens the About_View, THE About_View SHALL display one troubleshooting entry for each of these six topics: Backend unreachable, Backend in mock mode, voice unavailable, plan rejected, verification failed, and cancellation not confirmed. Each entry SHALL state the symptom the user sees and between 1 and 5 numbered steps the user can take to resolve it.
5. WHEN the user opens the About_View, THE About_View SHALL list known limitations, including each part of the current build that is mocked and each part that is unverified, with every item labelled "Mocked" or "Unverified".

### Requirement 16: Animated character reflecting real states

**User Story:** As a user, I want a friendly status character, so that I can sense ATLAS state at a glance without it overstating results.

#### Acceptance Criteria

1. THE Character SHALL render as inline SVG with CSS animation from source code, using no raster or 3D assets.
2. WHEN the Backend state changes, THE Desktop_UI SHALL set Character_State within 500 milliseconds of receiving the change, using this mapping: no active task to idle; active voice capture to listening; QUEUED or PLANNING to thinking; RUNNING or VERIFYING to executing; AWAITING_CONFIRMATION to approval_required; SUCCEEDED with a `verification_passed` event for every step to success; FAILED or PARTIAL to error; CANCELLED to cancelled.
3. WHEN a task reaches `SUCCEEDED` without a `verification_passed` event for every step, THE Desktop_UI SHALL set Character_State to idle, SHALL NOT show the success animation, and SHALL display text stating that the task is not fully verified.
4. WHILE Mock_Mode is active, THE Character SHALL display the mock badge, and THE Desktop_UI SHALL NOT set Character_State to success for fixture results.
5. THE Desktop_UI SHALL display the current Character_State name as visible text adjacent to the Character, updated within 500 milliseconds of each Character_State change, so that status is available without the animation.
6. FOR ALL Backend task statuses, THE state-mapping function SHALL return exactly one Character_State (totality property).
7. IF the Backend task status is not one of the statuses listed in criterion 2, THEN THE state-mapping function SHALL return error and THE Desktop_UI SHALL display text indicating an unrecognized status.
8. WHEN the success, error, or cancelled animation completes, THE Desktop_UI SHALL return the Character to idle within 5 seconds, unless a new task has set a different Character_State in that period.
9. WHILE the user's operating system reduced-motion preference is enabled, THE Character SHALL show a static pose for each Character_State without CSS animation.

### Requirement 17: Accessibility, typography, and reduced motion

**User Story:** As a user with accessibility needs, I want keyboard operation, readable text, and reduced motion, so that I can use ATLAS comfortably.

#### Acceptance Criteria

1. THE Desktop_UI SHALL make every interactive control reachable and operable using only the keyboard (Tab, Shift+Tab, Enter, Space), in an order that follows the visual left-to-right, top-to-bottom layout, with a focus indicator of at least 2 px outline and a contrast ratio of at least 3:1 against adjacent colors.
2. THE Desktop_UI SHALL provide one keyboard shortcut that moves focus to the Command_Composer within 100 ms and one keyboard shortcut that activates Cancel, and SHALL list both shortcuts in the About_View.
3. THE Desktop_UI SHALL render body text at a base font size of at least 14 px with a contrast ratio of at least 4.5:1 against its background.
4. THE Desktop_UI SHALL convey every status through a text label and an icon in addition to color.
5. WHEN the Execution_Timeline or Result_Panel state changes, THE Desktop_UI SHALL announce the new state through an ARIA live region within 1 second of the change.
6. WHILE Reduced_Motion is active, THE Desktop_UI SHALL replace Character animation and transitions with static poses and a text status, and SHALL show no animation or transition longer than 0 ms.
7. WHERE the user enables the reduced-motion override in the Settings_Screen, THE Desktop_UI SHALL apply the Reduced_Motion behavior regardless of the operating system preference.
8. WHILE the Approval_Control dialog is open, THE Desktop_UI SHALL keep keyboard focus inside the dialog when Tab or Shift+Tab is pressed.
9. WHEN the user presses Escape while the Approval_Control dialog is open, THE Desktop_UI SHALL close the dialog without sending a confirm request and SHALL return keyboard focus to the control that opened it.
10. THE Desktop_UI SHALL provide a non-empty accessible name for every form control and button.

### Requirement 18: Backend client contract compliance and unavailable-service handling

**User Story:** As a developer, I want a typed client that follows the shared contract, so that the UI integrates cleanly with the Backend and fails safely.

#### Acceptance Criteria

1. THE Atlas_Client SHALL implement `plan`, `confirm`, `cancel`, `getTask`, `health`, and `subscribeEvents` operations, each with request and response shapes identical to those defined in `docs/api-contract.md`.
2. WHEN the Atlas_Client receives a response or event, THE Atlas_Client SHALL validate it against the shared schemas before passing it to the Event_Reducer.
3. IF a response or event fails schema validation, THEN THE Atlas_Client SHALL discard the payload, return a typed error of category invalid_response, and not pass the payload to the Event_Reducer.
4. WHEN the Atlas_Client sends a request, THE Atlas_Client SHALL abort the request after 10 seconds (15 seconds for `plan`) and return a typed error of category timeout.
5. IF the Backend cannot be connected to (connection refused or network failure), THEN THE Atlas_Client SHALL return a typed error of category unreachable within 5 seconds and leave existing UI state unchanged.
6. IF the Backend returns a non-2xx response, THEN THE Atlas_Client SHALL return a typed error of category rejected containing the HTTP status and a message truncated to 200 characters, with any substring matching a secret pattern (API keys, bearer tokens, passwords) replaced by `[REDACTED]` and the raw response body not exposed.
7. THE Atlas_Client SHALL send requests only to the configured `127.0.0.1` Backend origin and SHALL reject any request whose resolved host is not `127.0.0.1` without sending it.
8. THE Mock_Client SHALL implement the same interface as Atlas_Client and SHALL serve data from `packages/contracts/examples/`.
9. WHEN the Mock_Client emits events, THE Mock_Client SHALL preserve the event order defined in the example files, with 200 to 1000 ms between consecutive events, and SHALL set a mock label on every returned item and event.
10. THE Desktop_UI SHALL select Atlas_Client or Mock_Client only from the explicit user-selected mode, and SHALL NOT switch automatically to Mock_Client when the Backend is unreachable.
11. THE Desktop_UI SHALL NOT include provider credentials in the built frontend bundle.

### Requirement 19: Secret non-leakage in the UI

**User Story:** As a user, I want assurance that secrets never appear in the UI, logs, or storage, so that my credentials stay private.

#### Acceptance Criteria

1. WHEN the Desktop_UI receives text originating from the Backend, THE Desktop_UI SHALL pass the text through the Redactor before rendering it in any component, including the transcript, Plan_Inspector, Execution_Timeline, Mode_Indicator banner, and error messages.
2. WHEN the Settings_Store persists a value, THE Settings_Store SHALL persist no value that matches a secret pattern, where secret patterns are provider API keys, bearer tokens, passwords, and any value of a variable defined in `.env`.
3. WHEN the Desktop_UI writes a diagnostic log entry or generates copied diagnostics, THE Desktop_UI SHALL pass the content through the Redactor first, so that the written or copied content contains zero values matching a secret pattern.
4. IF the Redactor masks a value, THEN THE Desktop_UI SHALL display the marker "[redacted]" in place of each masked value, with the surrounding non-secret text unchanged.
5. IF the Redactor fails or throws an error while processing text, THEN THE Desktop_UI SHALL NOT render, log, store, or copy the unprocessed text, SHALL display the "[redacted]" marker in place of the whole text, and SHALL keep the application running.
6. THE Desktop_UI SHALL NOT include `.env` values or provider keys in the built frontend assets, such that a text search of every built asset for each `.env` value and each provider key returns zero matches.

### Requirement 20: Packaging, install, and launch documentation

**User Story:** As a tester, I want to build, install, and launch ATLAS from documented steps, so that I can reproduce the demo on a Windows machine.

#### Acceptance Criteria

1. THE Desktop_UI SHALL provide `package.json` scripts named `dev`, `build`, `lint`, `test`, and `tauri:build` (Tauri packaging), where each script exits with code 0 on success and a non-zero code on failure.
2. WHEN the `tauri:build` script runs on a Windows machine with Rust and Node installed and exits with code 0, THE Tauri_Shell SHALL produce at least one Installer file in the Tauri bundle output directory within 20 minutes.
3. THE Desktop_UI documentation SHALL list prerequisites (including the minimum Node and Rust versions used in testing), numbered install steps, numbered launch steps for Mock_Mode, numbered launch steps for Live_Mode, and the exact commands to run build, lint, and test.
4. THE Desktop_UI documentation SHALL state that installer signing is not performed in this build and that Windows may show an unknown-publisher warning when the Installer is run.
5. IF the Installer is not produced in the current environment, THEN THE completion report SHALL state that packaging is unverified and give the reason, including the failing command and its error output summary.
6. THE Desktop_UI SHALL include a proposed change to `src-tauri/tauri.conf.json` covering version, icon list, and minimum window size, submitted for project-owner approval, and SHALL NOT merge it as final until the project owner has recorded approval.
7. IF the project owner has not recorded approval of the proposed `src-tauri/tauri.conf.json` change, THEN THE Desktop_UI SHALL leave the existing `src-tauri/tauri.conf.json` values unchanged on the main branch.

### Requirement 21: Test coverage and honest reporting

**User Story:** As a project owner, I want automated tests and an honest report, so that I can judge what actually works.

#### Acceptance Criteria

1. THE Desktop_UI test suite SHALL include at least one passing unit test for each of the following: the Event_Reducer, the Redactor, Settings_Store validation, state-to-Character_State mapping, and Outcome_State derivation.
2. THE Desktop_UI test suite SHALL include contract tests that validate 100% of the fixture files in `packages/contracts/examples/` against the shared schemas and fail if any fixture does not conform.
3. THE Desktop_UI test suite SHALL include contract tests that validate every response and event type produced by the Mock_Client against the shared schemas and fail if any output does not conform.
4. THE Desktop_UI test suite SHALL include invalid-input tests for each of the following: an empty request, a request exceeding 2000 characters, a malformed plan, and a malformed event. Each test SHALL assert that the input is rejected, an error indication is shown to the user, and application state is unchanged.
5. THE Desktop_UI test suite SHALL include tests for an unavailable Backend, a request timeout, and the cancellation flow. Each test SHALL assert the resulting user-visible error or cancelled state and that no further events are applied to the cancelled request.
6. THE Desktop_UI test suite SHALL include a full Mock_Mode workflow test that runs from request submission to a displayed result and asserts the Outcome_State at completion.
7. THE Desktop_UI test suite SHALL include a secret non-leakage test that seeds at least one secret value into each Backend response field type that can carry text and asserts the secret value does not appear in the rendered output, persisted storage, or diagnostics output.
8. THE Desktop_UI test suite SHALL include a test that, WHEN the Backend reports a `SUCCEEDED` status with zero verification events, the Desktop_UI displays neither the text "verified" nor the success Character_State.
9. WHEN the build, lint, and test commands are run, THE completion report SHALL state, for each command, the command text, the exit code, the counts of passed, failed, and skipped tests or checks, and the name of each failed or skipped item.
10. THE completion report SHALL contain a separate section for each of the following: files created, features delivered, integration points, commands, test results, required configuration, mocked or unverified items, blockers, and next action. IF a section has no content, THEN THE completion report SHALL state "None" in that section.
11. THE completion report SHALL NOT label any behavior as verified unless it cites a specific automated test name or a documented manual run that demonstrated the behavior.

### Requirement 22: Scope boundaries and non-duplication

**User Story:** As a team member, I want the UI to stay within its workstream, so that safety and integration responsibilities remain with their owners.

#### Acceptance Criteria

1. WHEN the user approves or cancels a plan, THE Desktop_UI SHALL send the approval or cancellation request only to the Backend endpoints defined in `docs/api-contract.md`, and SHALL send no approval or cancellation request to any other network destination.
2. THE Desktop_UI SHALL contain no code that launches operating-system processes or sends keystrokes, and SHALL read or write files only within the Tauri app-data settings location.
3. WHEN the Desktop_UI receives LLM-derived text, THE Desktop_UI SHALL render it as escaped plain text, and SHALL NOT evaluate it as code or markup, execute it, or act on instructions contained in it, including a plan approval, cancellation, or settings change.
4. IF a required Backend endpoint (journal, settings, provider status, version) is missing or does not respond within 5 seconds, THEN THE Desktop_UI SHALL display the dependent view with a visible "unavailable" label, SHALL keep all other views functional, and SHALL NOT discard previously entered user data.
5. WHEN the completion report is produced, THE Desktop_UI team SHALL list each endpoint that was unavailable during development as an integration point, naming the owning persona for each.
6. THE Desktop_UI SHALL NOT modify any file under `packages/contracts/`, `services/atlas-core/`, or `docs/api-contract.md`.
