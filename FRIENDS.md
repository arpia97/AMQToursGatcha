# Friends

Adding a player is a directed preference, with no approval step. The compact profile button shows a neutral person-plus before adding, olive for an outgoing add and pink for mutual adds. Its count is the number of people who added that profile, independent of the viewer. Your own button opens Added You. Players tiles use icon-only buttons beside their profile links; guests can sign in from the same control. The account pop-up has a Friends button with paginated Added / Added You lists.

Friends Only uses the signed-in viewer's outgoing adds, including mutual relationships. Rankings and quiz leaderboards also include the viewer. Collection (Owned By / Wanted By), player marketplace, trades and user-auction filters include added players only. Filtering runs before sorting/pagination and composes with existing type, search, rarity, wishlist and venue filters. Collection privacy still applies; a friendship does not grant inventory or balance access. Anonymous friends-list/filter requests are rejected.

Settings includes **Notify me when an added friend beats my quiz score**, off by default for existing and new accounts. On a published run's personal-best improvement, recipients are players who added that player, opted in and have a saved score for that quiz. A greater score or faster equal-score time can move ahead. An improvement already ahead of the recipient does not repeatedly notify; drafts, previews and unchanged retries do not notify. A displaced global #1 receives the existing notification instead of a second friend alert. Notices are inserted in the existing score/reward transaction with unique event keys. Disabling the preference clears its unseen friend alerts. Existing global #1 alerts are unaffected.

The additive `player_friends(player,friend,created)` table has unique directed edges, a self-add constraint and an incoming index. It follows both ends of canonical identity migration. Gameplay-only resets retain relationships as account preferences; deleting the full player registry clears them. No historical gameplay or notices are replayed on startup. `players.notify_friends_quiz` defaults to0, and older Settings clients preserve it when omitted.

- `POST /api/friend-set` accepts `{player: targetPlayerId, added: boolean}` and an idempotency key. The actor is always the authenticated account. Set semantics make response-loss retries safe.
- `GET /api/friends?view=added|incoming&page=N` returns25 people per page and only the current account's list.
- `GET /api/profiles` and `/api/player` include viewer-relative `friendship: {added, mutual, followers}` metadata.
- Rankings, quiz-leaderboard, card-collectors, market and trades accept `friends=1` with the existing query parameters.

Friend preference writes and list reads bypass market, starter-reward, scheduler and full-state work. SQL lookups use the current page's IDs or indexed friendship edges. Client list/filter requests guard against stale responses, account changes and dismissed dialogs.
