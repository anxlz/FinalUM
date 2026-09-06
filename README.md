# UM League — CODM Scrim Bot

All four phases: teams and scheduling, tickets and applications, the OCR result pipeline
with scoring and approval, and compliance flagging — visually themed with the Universe
Meta design system (UM-DS-2026 · EMEA).

Stack is as decided in §2 and not re-litigated: Bun, plain TypeScript, discord.js v14,
Drizzle + `bun:sqlite`, systemd. No NestJS, no Prisma, no `node-fetch`, no PM2. The OCR
model runs as a separate Python service.

## Setup

```bash
bun install
cp .env.example .env          # fill in DISCORD_TOKEN and DISCORD_CLIENT_ID
bun run deploy                # publish slash commands to Discord
bun run start
```

See `ocr-service/SETUP.md` for the OCR microservice, and the in-repo slash commands
(`/ticketconfig`, `/embedconfig`, `/config`) for runtime customization. Full command list
and design rationale are documented inline in each service file's header comment.

## Guided vs. one-shot match creation

- `/creatematch` — the step wizard (opponent select → date/time modal → confirm), each step
  editing the same message.
- `/matchregister` — the original one-shot command, every option typed at once.
- `/matchcenter` — a captain's personal dashboard (tier, weekly matches vs. the compliance
  cap, points, status) with buttons into Create Match, My Matches, Leaderboard and Support.

Both creation paths end at the same `registerMatch()` call and post the same match embed
with Confirm/Decline buttons for the opposing captain — the wizard is a friendlier front
end, not a second scheduling system.

## Live leaderboard

`/leaderboardlive start [view] [sort] [region] [channel]` posts one leaderboard message and
a 30-second watcher (`src/leaderboard/live-refresh.ts`) edits that same message in place on
every tick — it never sends a new one. `/leaderboardlive stop` stops the refresh; the
message itself is left as-is. `/leaderboard` remains a one-off, non-refreshing snapshot for
anyone to run at any time, and `/setleaderboardchannel` sets the default channel both
commands post to.

## Match Room

Every match ticket now carries a status checklist (confirmed / scheduled / result submitted
/ staff-verified) plus **Submit Result**, **Match Details** and **Request Staff** buttons.
One real Discord constraint shows up here: modals only support text inputs, not file
uploads, so **Submit Result** can't collect a screenshot from a popup the way a web form
would — it points the captain at `/matchresult`, which takes the screenshot as a normal
command attachment instead.

## Visual system — Universe Meta (UM-DS-2026 · EMEA)

Discord embeds only expose one accent colour and no font control, so the design system
applies at two different depths:

- **Embeds** (`src/lib/embeds.ts`): the semantic palette (Warn/Win/Loss/Info, plus Universe
  Red reserved for `live`), bold body text throughout, and a `chip()` helper that renders
  status as "● LABEL" instead of emoji, matching the system's "colour + dot" rule.
- **The leaderboard image** (`src/leaderboard/render.service.ts`) is a real canvas surface,
  so the system applies in full: the matte 6-step surface ramp (never pure black), Antonio
  for titles/scores/names, Archivo for section headings, Geist for body copy, Geist Mono for
  the numeric stat columns, sharp corners, and exactly one red accent per composition (a 2px
  rule under the header — rank is never colour-coded across the whole medal set, only rank 1
  gets the cream "trophy" ring the system reserves for grand-final moments). Motion is a
  straight slide on the system's one specified easing, `cubic-bezier(.2,.8,.2,1)` — no
  fade-in, glow or bounce, all of which the system explicitly rules out. The live board's
  "● LIVE" mark is the one place a loop is used, per the system's own LIVE-dot spec.

The brand fonts (Antonio, Archivo, Geist, Geist Mono — all OFL-licensed) are bundled in
`assets/fonts/`, sourced from the `google/fonts` and `vercel/geist-font` repos.

**Known limitation:** HTML5 canvas `fillText` doesn't perform Arabic shaping or bidi
reordering, so an Arabic team name renders as disconnected glyphs rather than properly
joined script. Fixing this needs a HarfBuzz-based text shaper in front of the canvas draw
call — real work, not done here. CJK and Latin names are unaffected.
