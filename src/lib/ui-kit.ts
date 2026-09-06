/**
 * Components V2 helpers + the two-colour button rule ("use gray and red buttons" — red for
 * the one primary/forward action on a screen, gray for everything else: back, cancel,
 * decline, secondary switches). CV2 replaces embeds entirely on any message that uses it —
 * Discord rejects mixing `embeds` with `flags: IsComponentsV2` — so every CV2 payload here
 * is `{ components, files?, flags }` with no `embeds` key at all.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

/** Universe Red — the one accent colour, used as every container's left bar. */
export const BRAND_COLOR = 0xfa1146;

export function redButton(customId: string, label: string, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Danger).setDisabled(disabled);
}

export function grayButton(customId: string, label: string, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
}

/** A hyperlinked button — no custom id, opens `url` directly (Discord's Link button style). */
export function linkButton(url: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function divider(spacing: "small" | "large" = "small"): SeparatorBuilder {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

/** A single full-width image from an attachment already passed in `files`. */
export function galleryImage(filename: string, altText: string): MediaGalleryBuilder {
  return new MediaGalleryBuilder().addItems((item) => item.setURL(`attachment://${filename}`).setDescription(altText));
}

/** Text + a compact accessory (button) on one line — used for menu rows.
 *  Same 3-line cap as `sectionWithThumbnail` — see its comment for why. */
export function sectionWithButton(lines: string[], accessory: ButtonBuilder): SectionBuilder {
  if (lines.length === 0) {
    throw new Error("sectionWithButton requires at least one line.");
  }
  return new SectionBuilder()
    .addTextDisplayComponents(lines.slice(0, 3).map((l) => text(l)))
    .setButtonAccessory(accessory);
}

/**
 * Text + a small square thumbnail (avatar/logo) on one line — used for profile cards.
 *
 * Discord's Section component accepts at most 3 text-display children. Passing more (e.g.
 * 5 profile lines) doesn't get a clean validation error back from discord.js/shapeshift —
 * it throws a raw, unhelpful "Invalid Array length" from deep inside @discordjs/builders'
 * component-array validator. Guard against that here rather than at every call site: keep
 * the first 3 lines on the thumbnail section and let the caller render any overflow as a
 * separate `text()` block elsewhere in the container.
 */
export function sectionWithThumbnail(lines: string[], imageUrl: string, altText: string): SectionBuilder {
  if (lines.length === 0) {
    throw new Error("sectionWithThumbnail requires at least one line.");
  }
  return new SectionBuilder()
    .addTextDisplayComponents(lines.slice(0, 3).map((l) => text(l)))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl).setDescription(altText));
}

export type ContainerChild =
  | TextDisplayBuilder
  | SeparatorBuilder
  | SectionBuilder
  | MediaGalleryBuilder
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<StringSelectMenuBuilder>;

/**
 * `ContainerBuilder` has no generic `addComponents` — each child type has its own
 * `addXComponents` method. This dispatches by instance so callers can pass a flat mixed
 * array, matching how every other builder in this codebase composes a payload.
 */
export function container(children: ContainerChild[], accentColor: number = BRAND_COLOR): ContainerBuilder {
  const c = new ContainerBuilder().setAccentColor(accentColor);
  for (const child of children) {
    if (child instanceof TextDisplayBuilder) c.addTextDisplayComponents(child);
    else if (child instanceof SeparatorBuilder) c.addSeparatorComponents(child);
    else if (child instanceof SectionBuilder) c.addSectionComponents(child);
    else if (child instanceof MediaGalleryBuilder) c.addMediaGalleryComponents(child);
    else if (child instanceof ActionRowBuilder) c.addActionRowComponents(child as ActionRowBuilder<ButtonBuilder>);
  }
  return c;
}

export function actionRow<T extends ButtonBuilder | StringSelectMenuBuilder>(...items: T[]): ActionRowBuilder<T> {
  return new ActionRowBuilder<T>().addComponents(...items);
}

/** The flag every CV2 send/reply/edit needs. Combine with Ephemeral via bitwise OR. */
export const CV2 = MessageFlags.IsComponentsV2 as const;
