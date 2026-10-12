# Examples

Pass these as the prompt to the Hamster MCP ask tool or `hamster chat`. Include local paths, branch, and diff in the same prompt when they help.

## Connect current work to priorities

I'm working on the webhook retry logic in apps/sync/src/modules/linear/. What are the team's priorities around this area, and is there an initiative tracking this work?

## Understand a blocker before coding

I'm about to start on the mobile checkout flow. What's blocking that initiative, and are there any briefs already in progress for it?

## Pull blueprint context during implementation

I'm modifying the auth middleware in apps/web/app/api/. What does our blueprint say about the auth architecture for third-party integrations?

## Find related work before duplicating it

I'm about to add rate limiting to the webhook processor in apps/sync/. Are there other briefs or tasks that touch rate limiting or the webhook processor?

## Capture work you already prototyped

I prototyped rate-limit middleware in apps/api/middleware/rate-limit.ts on branch feat/rate-limiting. Create a brief for this work and link it to the Q3 platform reliability initiative.

## Narrow a blocker to the current branch

Start a thread:

I'm working in apps/sync/src/modules/linear/. What's blocking the Linear sync initiative?

Then continue the same thread:

Which of those blockers can I unblock from the current branch, and are there tasks already assigned to me?

Use the second form only when the follow-up relies on the first response.
