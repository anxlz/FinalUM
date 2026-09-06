export interface TemplateContext {
  home: string;
  away: string;
  id: string;
  category: string;
  mode: string;
  kickoff: string;
  date: string;
  time: string;
  captain_home: string;
  captain_away: string;
  manager_home: string;
  manager_away: string;
  league: string;
}

export const PLACEHOLDERS: Record<keyof TemplateContext, string> = {
  home: "Home team tag, or its name when no tag is set",
  away: "Away team tag, or its name when no tag is set",
  id: "Public match ID, e.g. CODM-20260814-000127",
  category: "Match category — scrim, official, tournament, practice",
  mode: "Game mode once known, otherwise 'tbd'",
  kickoff: "Kickoff time, rendered in each viewer's own timezone",
  date: "Kickoff date in the league timezone",
  time: "Kickoff time in the league timezone",
  captain_home: "Mention of the home captain",
  captain_away: "Mention of the away captain",
  manager_home: "Mention of the home team's official representative",
  manager_away: "Mention of the away team's official representative",
  league: "League name from /embedconfig name",
};

export const PLACEHOLDER_KEYS = Object.keys(PLACEHOLDERS) as Array<keyof TemplateContext>;

const TOKEN_PATTERN = /\{([a-z_]+)\}/g;

export interface TemplateValidation {
  valid: boolean;
  unknown: string[];
  used: string[];
}

export function validateTemplate(template: string): TemplateValidation {
  const used: string[] = [];
  const unknown: string[] = [];

  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const token = match[1]!;
    if ((PLACEHOLDER_KEYS as string[]).includes(token)) {
      if (!used.includes(token)) used.push(token);
    } else if (!unknown.includes(token)) {
      unknown.push(token);
    }
  }

  return { valid: unknown.length === 0, unknown, used };
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(TOKEN_PATTERN, (whole, token: string) => {
    const value = context[token as keyof TemplateContext];
    return value === undefined ? whole : value;
  });
}

export function slugifyChannelName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (slug || "match").slice(0, 90);
}

export const SAMPLE_CONTEXT: TemplateContext = {
  home: "ALP",
  away: "BRV",
  id: "CODM-20260814-000127",
  category: "scrim",
  mode: "hardpoint",
  kickoff: "Friday 22 August 2026 20:30",
  date: "2026-08-22",
  time: "20:30",
  captain_home: "@AlphaCaptain",
  captain_away: "@BravoCaptain",
  manager_home: "@AlphaManager",
  manager_away: "@BravoManager",
  league: "UM League",
};
