// src/deploy-commands.js
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('mail')
    .setDescription('Send an email')
    .addStringOption(opt => opt.setName('recipient').setDescription('Email address').setRequired(true))
    .addStringOption(opt => opt.setName('subject').setDescription('Email subject').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Email body (HTML supported)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('mailstats')
    .setDescription('Show email statistics'),

  new SlashCommandBuilder()
    .setName('providerstatus')
    .setDescription('Show provider usage and status'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View pending email queue'),

  new SlashCommandBuilder()
    .setName('retryfailed')
    .setDescription('Retry all dead letter emails'),

  new SlashCommandBuilder()
    .setName('bill')
    .setDescription('Generate and send an invoice/bill')
    .addStringOption(opt => opt.setName('recipient').setDescription('Email recipient').setRequired(true))
    .addStringOption(opt => opt.setName('subject').setDescription('Email subject').setRequired(true))
    .addStringOption(opt => opt.setName('customer_name').setDescription('Customer name').setRequired(true))
    .addStringOption(opt => opt.setName('vehicle_no').setDescription('Vehicle number').setRequired(true))
    .addStringOption(opt => opt.setName('vehicle_type').setDescription('Vehicle type').setRequired(true))
    .addStringOption(opt => opt.setName('meter_reading').setDescription('Meter reading').setRequired(true))
    .addStringOption(opt => opt.setName('items').setDescription('JSON array of items. Ex: [{"sl":1,"particulars":"Oil","rate":"500","amount":"500"}]').setRequired(true))
    .addNumberOption(opt => opt.setName('total').setDescription('Total amount').setRequired(true)),
].map(cmd => cmd.toJSON());

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Deploying slash commands...');

    if (process.env.GUILD_ID) {
      // Instant guild‑based deploy (recommended for testing)
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Guild slash commands deployed instantly.');
    } else {
      // Global deploy (can take up to an hour to propagate)
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('📡 Global slash commands deployed (may take some time).');
    }
  } catch (err) {
    console.error('❌ Deploy error:', err);
  }
}

module.exports = { deployCommands };