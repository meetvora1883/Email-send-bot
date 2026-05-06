const { Client, GatewayIntentBits } = require('discord.js');
const { initializeDB } = require('./database/sqlite');
const { handleMailCommand } = require('./commands/mailCommand');
const { handleAdminCommand } = require('./commands/adminCommands');
const { startHealthChecks } = require('./services/healthCheck');
const { resumeQueue } = require('./services/queueService');
const { startDLQRetryScheduler } = require('./services/deadLetterQueue');
const { startWebServer } = require('./web/server');
const { cleanupOldBills } = require('./services/invoiceService');
const { deployCommands } = require('./deploy-commands');   // auto‑deploy on startup
const { logInfo, logError, logSuccess } = require('./utils/logger');
const config = require('./utils/config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  logSuccess('BOT', `Logged in as ${client.user.tag}`);

  // Deploy slash commands instantly (if GUILD_ID is set) or globally
  await deployCommands();

  initializeDB();
  startWebServer();
  resumeQueue();
  startDLQRetryScheduler();
  startHealthChecks(client);

  // Auto‑cleanup old invoice images every 24 hours
  setInterval(() => {
    cleanupOldBills(parseInt(process.env.BILL_CLEANUP_DAYS) || 7);
  }, 24 * 60 * 60 * 1000);

  logInfo('BOT', 'Bot is ready with all systems');
});

// Slash command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;

  // Admin slash commands
  if (['mailstats', 'providerstatus', 'queue', 'retryfailed'].includes(commandName)) {
    await interaction.deferReply();
    await handleAdminCommand(interaction, commandName);
    return;
  }

  // Regular mail command
  if (commandName === 'mail') {
    await interaction.deferReply();
    await handleMailCommand(interaction);
    return;
  }

  // Bill / invoice command
  if (commandName === 'bill') {
    const billCommand = require('./commands/billCommand');
    await billCommand.execute(interaction);
    return;
  }
});

// Prefix command handler (for traditional !commands)
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // Admin prefix commands
  if (content.startsWith('!mailstats') || content.startsWith('!providerstatus') ||
      content.startsWith('!queue') || content.startsWith('!retryfailed')) {
    await handleAdminCommand(message);
    return;
  }

  // Mail prefix command
  if (content.startsWith('!mail ')) {
    await handleMailCommand(message);
    return;
  }

  // Bill prefix command
  if (content.startsWith('!bill ')) {
    const billCommand = require('./commands/billCommand');
    await billCommand.execute(message, true);  // isPrefix = true
    return;
  }
});

client.login(config.discord.token);