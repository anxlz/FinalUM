/**
 * Components V2 message builders for the two application screens that need the branded
 * hero image (§4/§5 of the design brief):
 *
 *   - "ROSTER CONFIRM" — the captain-facing add-players screen, refreshed after every
 *     player added so the rendered roster image always matches what's in the database.
 *   - "APPLICATION ${ref}" — the staff-facing review screen posted to the submitted
 *     applications channel, refreshed (and re-rendered with a green/red status band) once
 *     staff approve or reject it.
 *
 * Both need a Discord `Client` to resolve player avatars from `discordId` — application
 * players who typed their IGN/UID by hand (no linked Discord account) fall back to the
 * initials badge the renderer already draws when no avatar URL is available.
 */

import { AttachmentBuilder, type BaseMessageOptions, type Client } from "discord.js";
import type { Application, ApplicationPlayer } from "../db/schema";
import { getApplication, listApplicationPlayers } from "./application.service";
import { renderHero, type HeroRosterEntry, type HeroStatus } from "../leaderboard/brand-render.service";
import { BRAND_COLOR, CV2, actionRow, container, divider, galleryImage, grayButton, redButton, text } from "../lib/ui-kit";
import { APPLICATION_BUTTONS } from "../commands/application.commands";

const MAX_PLAYERS = 10;

async function rosterEntries(client: Client, roster: ApplicationPlayer[]): Promise<HeroRosterEntry[]> {
  const entries: HeroRosterEntry[] = [];
  for (const player of roster) {
    let avatarUrl: string | null = null;
    if (player.discordId) {
      const user = await client.users.fetch(player.discordId).catch(() => null);
      avatarUrl = user?.displayAvatarURL({ extension: "png", size: 128 }) ?? null;
    }
    entries.push({
      name: `${player.isCaptain ? "★ " : ""}${player.ign}`,
      avatarUrl,
      sub: player.uid ? `UID ${player.uid}` : undefined,
    });
  }
  return entries;
}

function reviewStatus(application: Application): HeroStatus | undefined {
  if (application.status === "APPROVED") return { label: "Approved", tone: "approved" };
  if (application.status === "REJECTED") return { label: "Rejected", tone: "rejected" };
  return undefined;
}

/** Captain-facing "Add Players" / "Submit Application" screen — always regenerated fresh
 *  from the current roster so it never shows stale players. */
export async function buildRosterConfirmMessage(client: Client, applicationId: string): Promise<BaseMessageOptions> {
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const roster = listApplicationPlayers(applicationId);

  const banner = await renderHero({
    title: "ROSTER CONFIRM",
    subtitle: `${application.teamName} — ${roster.length}/${MAX_PLAYERS} players`,
    kicker: application.publicRef,
    roster: await rosterEntries(client, roster),
    footer: "ADD PLAYERS, THEN SUBMIT WHEN YOUR ROSTER IS READY",
  });
  const attachment = new AttachmentBuilder(banner, { name: "roster-confirm.png" });

  const full = roster.length >= MAX_PLAYERS;

  return {
    components: [
      container(
        [
          galleryImage("roster-confirm.png", "Roster Confirm"),
          divider(),
          text(
            full
              ? "Your roster is full. Submit when you're ready — staff will review it shortly."
              : "Add up to four players at a time, then submit when your roster is ready.",
          ),
          actionRow(
            grayButton(`app:addplayers:${applicationId}`, "Add Players", full),
            redButton(`app:submit:${applicationId}`, "Submit Application"),
          ),
        ],
        BRAND_COLOR,
      ),
    ],
    files: [attachment],
    flags: CV2,
  };
}

/** Staff-facing review screen posted to the submitted-applications channel, and re-sent
 *  (via an in-place edit) once staff approve or reject the application. */
export async function buildApplicationReviewMessage(client: Client, applicationId: string): Promise<BaseMessageOptions> {
  const application = getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  const roster = listApplicationPlayers(applicationId);
  const status = reviewStatus(application);
  const decided = status !== undefined;

  const banner = await renderHero({
    title: `APPLICATION ${application.publicRef}`,
    subtitle: `${application.teamName} • ${application.region ?? "Region not set"} • ${application.tier ?? "Tier not set"}`,
    status,
    roster: await rosterEntries(client, roster),
    footer: `APPLICANT ${application.applicantDiscordId}`,
  });
  const attachment = new AttachmentBuilder(banner, { name: "application-review.png" });

  return {
    components: [
      container(
        [
          galleryImage("application-review.png", `Application ${application.publicRef}`),
          divider(),
          text(`Applicant: <@${application.applicantDiscordId}>`),
          ...(decided
            ? []
            : [
                actionRow(
                  redButton(`${APPLICATION_BUTTONS.approve}:${application.id}`, "Approve"),
                  grayButton(`${APPLICATION_BUTTONS.reject}:${application.id}`, "Reject"),
                ),
              ]),
        ],
        BRAND_COLOR,
      ),
    ],
    files: [attachment],
    flags: CV2,
  };
}
