# Smoke Test Checklist

Use this checklist after each release or Feishu configuration change.

## Preconditions

- `.env` is populated from [`.env.example`](../.env.example).
- The service starts with `npm run dev`.
- The acceptance Feishu group contains the bot.
- The Feishu Base app and table IDs are present if Base sync is enabled.

## Checklist

| Step | Action | Expected Result |
| --- | --- | --- |
| 1 | `GET /api/health` | Returns `{ "ok": true }`. |
| 2 | `GET /api/feishu/status` | Credentials, bot binding, event mode, and Base readiness match the current tenant setup. |
| 3 | `POST /api/feishu/send-test` with the configured chat ID | A test message appears in the real Feishu group. |
| 4 | Send a real PDF or DOCX submission in the group | The inbound event is accepted, parsed, scored, and written to SQLite. |
| 5 | Re-check `GET /api/feishu/status` | `lastInboundEventAt` updates and `lastNormalizedMessage.documentParseStatus=parsed`. |
| 6 | `GET /api/operator/submissions?campId=<camp-id>` | The candidate appears in the operator queue with the expected final status and score. |
| 7 | `GET /api/public-board?campId=<camp-id>` | The public ranking board reflects the new score for visible participants. |
| 8 | `POST /api/announcements/run` | The announcement job is recorded, and the bot posts the summary. |
| 9 | Check Feishu Base raw-events and scores tables | The new document submission is mirrored into Base. |

## Expected Pass/Fail Signals

- `accepted: true` means the event entered scoring.
- `finalStatus: valid` means the submission passed the rule-first path.
- `accepted: false` with `reason: unbound_chat` means the message came from a chat that is not bound to the active camp.
- `documentParseStatus: failed` means the Feishu file could not be downloaded or parsed.

## Failure Entry Points

- `/api/feishu/status` for the live readiness probe.
- `/api/operator/submissions` for scoring results.
- `/api/public-board` for the visible ranking output.
- `src/app.ts` for inbound event handling and status fields.
- `src/services/feishu/client.ts` for Feishu API failures.
- `src/services/documents/extract-text.ts` for document parsing outcomes.

## Stop Conditions

Treat the release as blocked if any of the following are true:

- Bot messages cannot be sent to the acceptance group.
- The real group does not show incoming document submissions.
- `GET /api/feishu/status` reports credentials or Base as unready.
- PDF/DOCX submissions fail before text extraction or remain stuck in `pending_review_parse_failed`.
