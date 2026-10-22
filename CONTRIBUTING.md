# Contributing to Helix Utilities

Thanks for helping make Helix better.

## Before opening a pull request

1. Create a branch from `main`.
2. Keep each pull request focused on one feature or fix.
3. Never commit `.env` files, bot tokens, API keys, or `node_modules`.
4. Run the relevant checks:

   ```bash
   cd bot && npm ci && npm run check
   cd ../dashboard && npm ci && npm run build
   ```

## Project layout

- `bot/` — Discord bot, command handlers, database models, and the authenticated stats API.
- `dashboard/` — Next.js dashboard for Discord OAuth, server settings, and live bot stats.
- `assets/` — GitHub README artwork.

## Reporting a bug

Please include:

- What you expected to happen
- What happened instead
- The command, slash command, or dashboard page involved
- Relevant logs with tokens, IDs, and private URLs removed
- Node.js version and hosting environment

## Style

- Use clear names and avoid unrelated formatting changes.
- Prefer small, composable functions.
- Validate user-controlled input at the boundary.
- Preserve the server-owner protections around antinuke settings.
