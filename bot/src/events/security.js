const { handleAuditEntry } = require('../modules/antinuke');

module.exports = [
  {
    // Requires the GuildModeration intent + View Audit Log permission
    name: 'guildAuditLogEntryCreate',
    async execute(entry, guild) {
      await handleAuditEntry(entry, guild);
    },
  },
];
