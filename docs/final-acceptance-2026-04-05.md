# Final Acceptance - 2026-04-05

## Result

The project passed the real Feishu acceptance path on 2026-04-05.

## Verified End-to-End

- API health check passed.
- Feishu readiness check passed.
- Bot outbound messaging succeeded in the live group.
- A real PDF submission from the live group was downloaded, parsed, scored, written to SQLite, and mirrored into Feishu Base.
- A ranking announcement was sent to the live group and a new board snapshot was created.

## Live Evidence

- Acceptance group chat ID: `oc_a867f87170ab5e892b86ffc2de79790b`
- Live bot smoke-test message ID: `om_x100b521373fcd0a0c438563f83e43cf`
- Live ranking announcement message ID: `om_x100b5213043db4a0c45f7e54df78eeb`
- Real PDF message ID used for acceptance: `om_x100b523b17393ca4c31e460f96f5ec2`
- Candidate ID after scoring: `session-01:ou_789911abef736a08f44286493d3285c5`

## Parsing Outcome

- `documentParseStatus=parsed`
- `documentTextLength=2166`
- `finalStatus=valid`
- `totalScore=7`

## Base Mirror Outcome

- Raw-events mirror record found for `message_id=om_x100b523b17393ca4c31e460f96f5ec2`
- Scores mirror record found for `candidate_id=session-01:ou_789911abef736a08f44286493d3285c5`

## Notes

- The accepted PDF sender currently exists as an observer member in local demo data, so the public board correctly keeps that member hidden.
- Public board visibility still follows member whitelist and exclusion rules.
- The production submission path is document-first. Tags remain optional for compatibility, but they are no longer required for PDF or DOCX submissions inside the active biweekly session window.
