/**
 * Interactive "Create Match" wizard — opponent select → date/time modal → confirm, each
 * step editing the same message, mirroring the step-indicator flow in the Universe Meta
 * mockups. `/matchregister` still exists as a one-shot command for anyone who prefers
 * typing every option at once; this is the guided alternative.
 *
 * State lives in a short-lived in-memory session keyed by a compact token. Discord caps
 * `custom_id` at 100 characters, and two team UUIDs alone (36 chars each) already blow that
 * budget once combined with a date, time and timezone — so state can't be encoded directly
 * in the component id the way the rest of this codebase does for short values (see
 * `encodeHistoryScope`). A wizard session is inherently transient UI state, not a durable
 * setting, so this doesn't run into the §5 "everything through AutomationConfig" rule —
 * that rule is about settings that must survive a restart; losing an in-progress wizard on
 * restart just means the captain runs `/creatematch` again.
 */

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type InteractionReplyOptions,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { errorEmbed } from "../lib/embeds";
import { DateTimeParseError, parseSchedule } from "../lib/datetime";
import { getConfig } from "../lib/automation-config";
import {
  MatchServiceError,
  recordAnnouncement,
  registerMatch,
} from "../matches/match.service";
import { buildMatchButtons, buildMatchEmbed } from "../discord/discord-match-embed.service";
import { findTeamsForMember, getTeam, searchTeams } from "../teams/team.service";
import { renderHero, type HeroDetail } from "../leaderboard/brand-render.service";
import { BRAND_COLOR, CV2, actionRow, container, divider, galleryImage, grayButton, redButton, text, type ContainerChild } from "../lib/ui-kit";

export const WIZARD_PREFIX = "wizard";

interface WizardSession {
  guildId: string;
  ownTeamId: string;
  opponentId?: string;
  date?: string;
  time?: string;
  timezone?: string;
  createdAt: number;
}

const sessions = new Map<string, WizardSession>();
const SESSION_TTL_MS = 15 * 60 * 1000;

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function getSession(token: string): WizardSession | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

async function stepMessage(
  step: 1 | 2 | 3,
  guildId: string,
  subtitle: string,
  details: HeroDetail[],
  extra: ContainerChild[],
): Promise<InteractionReplyOptions> {
  const banner = await renderHero({
    kicker: `STEP ${step} OF 3`,
    title: "CREATE MATCH",
    subtitle,
    details,
    footer: "ONLY TEAM CAPTAINS CAN USE THIS ACTION",
  });
  const attachment = new AttachmentBuilder(banner, { name: `create-match-step${step}.png` });

  return {
    components: [
      container(
        [galleryImage(`create-match-step${step}.png`, `Create Match — Step ${step} of 3`), divider(), ...extra],
        BRAND_COLOR,
      ),
    ],
    files: [attachment],
    flags: CV2,
  } as InteractionReplyOptions;
}

/** A plain single-line CV2 status message (no hero image) for terminal wizard states —
 *  expired/cancelled/errored/confirmed. Keeps the same `flags: CV2` as every other step so
 *  editing the message never mixes CV2 with classic embeds. */
function statusMessage(title: string, description: string): InteractionReplyOptions {
  return {
    components: [container([text(`# ${title}`), text(description)], BRAND_COLOR)],
    files: [],
    flags: CV2,
  } as InteractionReplyOptions;
}

/** The captain's own single team, or a reply payload explaining why the wizard can't start. */
function resolveOwnTeam(
  guildId: string,
  discordId: string,
): { teamId: string } | { payload: InteractionReplyOptions } {
  const owned = findTeamsForMember(guildId, discordId).filter((t) => t.captainDiscordId === discordId);
  if (owned.length === 0) {
    return { payload: { embeds: [errorEmbed("Only team captains can create a match. Run /teamregister first.")] } };
  }
  if (owned.length > 1) {
    return {
      payload: {
        embeds: [
          errorEmbed(
            `You captain several teams (${owned.map((t) => t.name).join(", ")}). Use /matchregister and name the one you mean.`,
          ),
        ],
      },
    };
  }
  return { teamId: owned[0]!.id };
}

async function step1Payload(guildId: string, ownTeamId: string): Promise<InteractionReplyOptions> {
  const token = newToken();
  sessions.set(token, { guildId, ownTeamId, createdAt: Date.now() });

  const teams = searchTeams(guildId, "", 25).filter((t) => t.id !== ownTeamId);
  if (teams.length === 0) {
    return statusMessage("Create Match", "No other teams are registered yet to schedule against.");
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${WIZARD_PREFIX}:opponent:${token}`)
    .setPlaceholder("Select a team…")
    .addOptions(
      teams.slice(0, 25).map((t) => ({
        label: t.tag ? `${t.name} [${t.tag}]` : t.name,
        value: t.id,
        description: t.region ?? undefined,
      })),
    );

  return stepMessage(1, guildId, "Select your opponent. Only teams from the league are shown.", [], [
    actionRow(select),
    actionRow(grayButton(`${WIZARD_PREFIX}:cancel:${token}`, "Cancel")),
  ]);
}

export async function beginCreateMatchWizard(
  interaction: ButtonInteraction | ChatInputCommandInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const member = interaction.member as GuildMember;
  const resolved = resolveOwnTeam(interaction.guildId!, member.id);
  if ("payload" in resolved) {
    await interaction.reply({ ...resolved.payload, flags: 64 as never });
    return;
  }
  const payload = await step1Payload(interaction.guildId!, resolved.teamId);
  await interaction.reply({ ...payload, flags: CV2 | 64 } as never);
}

export function isWizardComponent(customId: string): boolean {
  return customId.startsWith(`${WIZARD_PREFIX}:`);
}

export async function handleWizardSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, action, token] = interaction.customId.split(":");
  const session = getSession(token!);
  if (!session) {
    await interaction.update(statusMessage("Wizard Expired", "This wizard session expired. Run /creatematch again.") as never);
    return;
  }

  if (action === "opponent") {
    const opponentId = interaction.values[0]!;
    session.opponentId = opponentId;
    const opponent = getTeam(opponentId)!;

    const payload = await stepMessage(
      1,
      session.guildId,
      `Opponent selected: ${opponent.name}.`,
      [
        { label: "Opponent", value: opponent.name },
        { label: "Region", value: opponent.region ?? "Not set" },
      ],
      [actionRow(grayButton(`${WIZARD_PREFIX}:back1:${token}`, "Back"), redButton(`${WIZARD_PREFIX}:tostep2:${token}`, "Next"))],
    );
    await interaction.update(payload as never);
  }
}

function dateTimeModal(token: string, defaultTimezone: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${WIZARD_PREFIX}:datesubmit:${token}`)
    .setTitle("Create Match — Date & Time")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("date")
          .setLabel("Date (YYYY-MM-DD)")
          .setPlaceholder("2026-09-21")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("time")
          .setLabel("Time, 24h (HH:mm)")
          .setPlaceholder("21:30")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("timezone")
          .setLabel("IANA timezone (blank = league default)")
          .setPlaceholder(defaultTimezone)
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );
}

export async function handleWizardButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, token] = interaction.customId.split(":");

  if (action === "begin") {
    await beginCreateMatchWizard(interaction);
    return;
  }

  const session = getSession(token!);
  if (!session) {
    await interaction.update(statusMessage("Wizard Expired", "This wizard session expired. Run /creatematch again.") as never);
    return;
  }

  if (action === "cancel") {
    sessions.delete(token!);
    await interaction.update(statusMessage("Create Match — Cancelled", "No match was created.") as never);
    return;
  }

  if (action === "back1") {
    sessions.delete(token!);
    await interaction.update((await step1Payload(session.guildId, session.ownTeamId)) as never);
    return;
  }

  if (action === "tostep2") {
    const defaultTimezone = getConfig(session.guildId, "league_timezone");
    await interaction.showModal(dateTimeModal(token!, defaultTimezone));
    return;
  }

  if (action === "confirm") {
    await confirmWizard(interaction, token!, session);
    return;
  }
}

async function confirmWizard(interaction: ButtonInteraction, token: string, session: WizardSession): Promise<void> {
  if (!session.opponentId || !session.date || !session.time || !session.timezone) {
    await interaction.update(statusMessage("Wizard Expired", "This wizard session expired. Run /creatematch again.") as never);
    return;
  }

  try {
    const result = registerMatch({
      guildId: session.guildId,
      homeTeamId: session.ownTeamId,
      awayTeamId: session.opponentId,
      category: "SCRIM",
      date: session.date,
      time: session.time,
      timeZoneOverride: session.timezone,
      registeredBy: interaction.user.id,
    });

    await interaction.update(
      statusMessage(
        "Match Confirmed",
        `Your match has been successfully created. ${result.match.publicMatchId} is waiting on ${result.awayTeam.name} to confirm.`,
      ) as never,
    );

    const channel = interaction.channel;
    const announcement =
      channel && "send" in channel
        ? await channel.send({
            content: `<@${result.awayTeam.captainDiscordId}>`,
            embeds: [
              buildMatchEmbed({
                match: result.match,
                homeTeam: result.homeTeam,
                awayTeam: result.awayTeam,
                advanceNoticeWarning: result.advanceNoticeWarning,
                complianceNotes: result.complianceFlags.map((f) => f.detail),
              }),
            ],
            components: buildMatchButtons(result.match),
          })
        : null;
    if (announcement) recordAnnouncement(result.match.id, announcement.channelId, announcement.id);
  } catch (error) {
    if (error instanceof MatchServiceError || error instanceof DateTimeParseError) {
      await interaction.update(statusMessage("Create Match — Error", error.message) as never);
      return;
    }
    throw error;
  } finally {
    sessions.delete(token);
  }
}

export async function handleWizardModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [, , token] = interaction.customId.split(":");
  const session = getSession(token!);
  if (!session || !session.opponentId) {
    await interaction.reply({
      ...(statusMessage("Wizard Expired", "This wizard session expired. Run /creatematch again.") as never),
      flags: CV2 | 64,
    });
    return;
  }

  const date = interaction.fields.getTextInputValue("date").trim();
  const time = interaction.fields.getTextInputValue("time").trim();
  const timezone = interaction.fields.getTextInputValue("timezone").trim() || getConfig(session.guildId, "league_timezone");

  try {
    // Validate now so a typo surfaces immediately rather than at final confirm.
    parseSchedule(date, time, timezone);
  } catch (error) {
    const message = error instanceof DateTimeParseError ? error.message : "Could not parse that date/time.";
    await interaction.reply({ ...(statusMessage("Create Match — Error", message) as never), flags: CV2 | 64 });
    return;
  }

  session.date = date;
  session.time = time;
  session.timezone = timezone;

  const opponent = getTeam(session.opponentId)!;
  const own = getTeam(session.ownTeamId)!;

  const payload = await stepMessage(
    3,
    session.guildId,
    "Review before sending the challenge.",
    [
      { label: "Your team", value: own.name },
      { label: "Opponent", value: opponent.name },
      { label: "Date", value: date },
      { label: "Time", value: time },
      { label: "Timezone", value: timezone },
      { label: "Category", value: "SCRIM" },
    ],
    [
      actionRow(
        grayButton(`${WIZARD_PREFIX}:tostep2:${token}`, "Back"),
        redButton(`${WIZARD_PREFIX}:confirm:${token}`, "Confirm Match"),
        grayButton(`${WIZARD_PREFIX}:cancel:${token}`, "Cancel"),
      ),
    ],
  );

  // The modal was opened from a message-component interaction, so its submission can edit
  // that same message rather than posting a new one.
  if (interaction.isFromMessage()) {
    await interaction.update(payload as never);
  } else {
    await interaction.reply({ ...payload, flags: CV2 | 64 } as never);
  }
}
