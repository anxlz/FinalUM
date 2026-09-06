# Universe Meta Dashboard

The dashboard is an independently deployable Next.js application. It is intentionally read-only until the shared Supabase/PostgreSQL data boundary and server-side Discord authorization are configured.

## Local development

```bash
bun install
bun run dev
```

Use Bun for all dashboard commands:

```bash
bun run typecheck
bun run build
bun run start
```

## Windows

Open a new Command Prompt or PowerShell window after installing Bun so the updated
user `PATH` is loaded. From the repository root, enter `dashboard` once:

```bat
cd C:\Projects\RMBUN\RM5\dashboard
bun --version
bun install
bun run dev
```

For the current already-open Command Prompt, refresh its PATH manually before running
the commands:

```bat
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
bun --version
```

If it still cannot find Bun, use the installed executable directly or restart the
terminal:

```bat
"%USERPROFILE%\.bun\bin\bun.exe" --version
```

Copy `.env.example` to `.env.local`. The dashboard supports two server-side data
sources, selected with `DATA_SOURCE`. The persistent Discord bot remains under the
repository root and is not deployed to Vercel.

## Choose the database

For local development with the same SQLite file used by the bot:

```env
DATA_SOURCE=sqlite
DATABASE_PATH=../data/uml.sqlite
```

The path is resolved from the `dashboard` directory. Both the bot and dashboard must
run on the same machine. The browser never receives the SQLite path.

To switch to Supabase/PostgreSQL:

```env
DATA_SOURCE=supabase
DATABASE_URL=your-supabase-postgresql-connection-string
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Restart the dashboard after changing `DATA_SOURCE`. SQLite mode does not require the
Supabase variables; Supabase mode does not use the local SQLite file.

## Connect the bot health endpoint

The bot starts a health endpoint on `HEALTH_PORT` (default `8080`). When the bot and
dashboard run on the same machine, set this in `dashboard/.env.local`:

```env
BOT_HEALTH_URL=http://127.0.0.1:8080/health
```

For a separately hosted bot, use its private or authenticated health URL instead. Do
not use `NEXT_PUBLIC_` for this variable. Restart `bun run dev` after changing it.

## Connect Supabase

In the Supabase project dashboard, copy the Project URL and anon key into the public
variables, and copy the server-side PostgreSQL connection string and service-role key
into the private variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=your-postgresql-connection-string
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The service-role key and database URL must remain server-only and must never be placed
in client components or variables beginning with `NEXT_PUBLIC_`.

## Discord login and permissions

Create or use a Discord application and configure these dashboard variables:

```env
DASHBOARD_AUTH_REQUIRED=true
DASHBOARD_GUILD_ID=your-discord-server-id
DASHBOARD_DISCORD_CLIENT_ID=your-discord-application-client-id
DASHBOARD_DISCORD_CLIENT_SECRET=your-discord-application-secret
DASHBOARD_SESSION_SECRET=generate-a-long-random-secret
DASHBOARD_DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

Add the redirect URI exactly in the Discord developer portal. The dashboard checks
the existing SQLite permission data: Discord administrators, configured staff roles,
active team captains, and active players are recognized server-side. The bot's
`DISCORD_TOKEN` is used only for guild-role verification and is never sent to the
browser.

Use `DASHBOARD_AUTH_REQUIRED=false` for local UI development without login. Set it
to `true` before exposing the dashboard to staff.
