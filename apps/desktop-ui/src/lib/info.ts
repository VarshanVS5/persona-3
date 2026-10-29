// Static product information shown in the About view and First_Launch_Flow (Req 4.2, 15).
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const BUILD_INFO = {
  productName: "Project ATLAS",
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "",
  buildDate: typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "",
  notice: "Project ATLAS hackathon build. Unsigned. Owner: Project ATLAS team.",
  contractVersion: "1.0",
};

export const PRIVACY_DISCLOSURE: Array<{ feature: string; provider: string; data: string }> = [
  { feature: "Planning (turning your request into a plan)", provider: "9Router", data: "The text of your request, sent by the local backend to the configured 9Router endpoint." },
  { feature: "Voice transcription", provider: "Amazon Transcribe", data: "Audio from your microphone, only if the backend has speech enabled." },
  { feature: "Spoken replies", provider: "Amazon Polly", data: "Reply text, only if the backend has speech replies enabled." },
];

export const PRIVACY_FOOTNOTE =
  "Screenshots, clipboard contents, and document contents are not transmitted by default. Mock mode sends nothing anywhere.";

export const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: "Ctrl+K", action: "Focus the command box" },
  { keys: "Ctrl+.", action: "Cancel the running task" },
  { keys: "Ctrl+Enter", action: "Submit the request (in the command box)" },
  { keys: "Esc", action: "Dismiss the approval dialog without approving" },
];

export const TROUBLESHOOTING: Array<{ topic: string; symptom: string; steps: string[] }> = [
  {
    topic: "Backend unreachable",
    symptom: "The mode indicator shows Disconnected.",
    steps: [
      "Start the backend (see apps/desktop-ui/README.md) so it listens on 127.0.0.1:8765.",
      "Open Settings > Diagnostics and check the Backend URL and health result.",
      "Switch to Mock mode only if you want to use fixtures; ATLAS never switches by itself.",
    ],
  },
  {
    topic: "Backend in mock mode",
    symptom: "The indicator shows Backend mock mode and results say SIMULATED by backend.",
    steps: [
      "The backend has ATLAS_MOCK_MODE=true. Nothing real is executed.",
      "Set ATLAS_MOCK_MODE=false in the backend .env and restart the backend for live execution.",
    ],
  },
  {
    topic: "Voice unavailable",
    symptom: "There is no microphone control.",
    steps: [
      "Voice needs the speech provider from the backend, which is not reported as available.",
      "Type your request in the command box instead.",
    ],
  },
  {
    topic: "Plan rejected",
    symptom: "The UI shows 'Plan could not be validated' or the backend blocks the plan.",
    steps: [
      "The plan did not match the shared contract or the backend policy.",
      "Rephrase the request using an allowed action (see Settings > Permissions).",
      "Check the Audit journal for the rejection entry.",
    ],
  },
  {
    topic: "Verification failed",
    symptom: "A step shows failed, or the result says verification evidence is missing.",
    steps: [
      "The backend could not confirm the expected result. Check the application or file yourself.",
      "Review the Audit journal entry for the failed step.",
      "Submit the request again only after checking nothing was changed.",
    ],
  },
  {
    topic: "Cancellation not confirmed",
    symptom: "The UI shows 'Cancellation not confirmed'.",
    steps: [
      "The backend did not acknowledge the cancel request. The current action may still finish.",
      "Use Retry cancel, then watch the timeline for a cancelled state.",
      "If the backend is unreachable, check the application yourself.",
    ],
  },
];

export const KNOWN_LIMITATIONS: Array<{ label: "Mocked" | "Unverified"; text: string }> = [
  { label: "Mocked", text: "Mock mode replays fixtures from packages/contracts/examples. Nothing is executed." },
  { label: "Unverified", text: "The live backend path is untested against the real services/atlas-core until Person 4 integration runs." },
  { label: "Unverified", text: "The Tauri shell and installer have not been built in this environment (Rust toolchain missing)." },
  { label: "Unverified", text: "Voice capture is not wired: the API contract has no audio endpoint. Voice transcript events are displayed if the backend sends them." },
  { label: "Unverified", text: "Provider status, permission scope, backend version and the audit journal have no backend endpoint yet. These show 'unavailable'." },
  { label: "Unverified", text: "The installer is unsigned; Windows may warn about an unknown publisher." },
];
