export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Helix Utilities',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Security, moderation and fun — in one bot.',
  color: process.env.NEXT_PUBLIC_BRAND_COLOR || '#7c5cff',
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO || '',
  support: process.env.NEXT_PUBLIC_SUPPORT_URL || '',
};

export const inviteUrl = (guildId) =>
  `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ''}`;
