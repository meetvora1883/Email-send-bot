const { SlashCommandBuilder } = require('discord.js');
const { checkRateLimits, incrementRateLimits } = require('../utils/rateLimiter');
const { logInfo, logError } = require('../utils/logger');
const { validateEmail, sanitizeInput } = require('../utils/validators');
const { generateCorrelationId, insertBillLog, updateBillLog } = require('../database/queries');
const { generateBillImage } = require('../services/invoiceService');
const { sendWithFailover } = require('../services/mailService');
const config = require('../utils/config');

// ---- Authorization check (same as mailCommand) ----
function isAuthorized(member) {
  if (config.discord.adminRoleId && member.roles.cache.has(config.discord.adminRoleId)) return true;
  if (config.discord.allowedUsers.length > 0 && config.discord.allowedUsers.includes(member.id)) return true;
  return (!config.discord.adminRoleId && config.discord.allowedUsers.length === 0);
}

module.exports = {
  data: new SlashCommandBuilder()
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

  async execute(interactionOrMessage, isPrefix = false) {
    let user, options, replyFn;

    // ---------- Slash command ----------
    if (!isPrefix && interactionOrMessage.isCommand?.()) {
      const interaction = interactionOrMessage;
      user = interaction.user;
      options = {
        recipient: interaction.options.getString('recipient'),
        subject: interaction.options.getString('subject'),
        customerName: interaction.options.getString('customer_name'),
        vehicleNo: interaction.options.getString('vehicle_no'),
        vehicleType: interaction.options.getString('vehicle_type'),
        meterReading: interaction.options.getString('meter_reading'),
        items: interaction.options.getString('items'),
        total: interaction.options.getNumber('total'),
      };
      await interaction.deferReply();
      replyFn = (content) => interaction.editReply(content);
    }
    // ---------- Prefix command ----------
    else if (isPrefix) {
      const message = interactionOrMessage;
      user = message.author;
      const content = message.content.trim();
      const args = content.slice(6).trim().split(' | ');
      if (args.length < 8) {
        await message.reply('❌ Invalid format: `!bill recipient@email | subject | customer_name | vehicle_no | vehicle_type | meter_reading | items_json | total`');
        return;
      }
      const [emailPart, subject, customer, vehicleNo, vehType, meter, itemsJson, total] = args.map(s => s.trim());
      if (!validateEmail(emailPart)) {
        await message.reply('❌ Invalid email.');
        return;
      }
      options = {
        recipient: sanitizeInput(emailPart),
        subject: sanitizeInput(subject),
        customerName: sanitizeInput(customer),
        vehicleNo: sanitizeInput(vehicleNo),
        vehicleType: sanitizeInput(vehType),
        meterReading: sanitizeInput(meter),
        items: itemsJson,
        total: parseFloat(total),
      };
      replyFn = (content) => message.reply(content);
    } else {
      return;
    }

    // ---------- Authorization ----------
    if (!isAuthorized(interactionOrMessage.member)) {
      await replyFn('❌ You are not authorized to use this command.');
      return;
    }

    // ---------- Rate limiting ----------
    if (!checkRateLimits(user.id)) {
      await replyFn('❌ Rate limit exceeded. Please try again later.');
      return;
    }

    // ---------- Parse items ----------
    let items;
    try {
      items = JSON.parse(options.items);
    } catch (e) {
      await replyFn('❌ Invalid items JSON format. Example: [{"sl":1,"particulars":"Oil","rate":"500","amount":"500"}]');
      return;
    }

    const correlationId = generateCorrelationId();
    logInfo('BILL', `Bill command from ${user.tag}`, correlationId);

    // ---------- Insert bill log ----------
    const billInsert = insertBillLog({
      recipient: options.recipient,
      subject: options.subject,
      customerName: options.customerName,
      vehicleNumber: options.vehicleNo,
      vehicleType: options.vehicleType,
      meterReading: options.meterReading,
      items,
      total: options.total,
      discordUserId: user.id,
      correlationId
    });

    try {
      // ---------- Generate invoice image ----------
      const { filePath, html } = await generateBillImage({
        billNumber: billInsert.billNumber,
        date: billInsert.date,
        customerName: options.customerName,
        vehicleNumber: options.vehicleNo,
        vehicleType: options.vehicleType,
        meterReading: options.meterReading,
        items,
        total: options.total,
        terms: "1. Payment due within 15 days.\n2. Subject to Mumbai jurisdiction.",
        authorizedSignatory: "Authorized Signatory"
      });

      updateBillLog(billInsert.id, { imagePath: filePath, htmlContent: html });

      const attachments = [{
        filename: `invoice-${billInsert.billNumber.replace(/\//g, '-')}.png`,
        path: filePath
      }];

      const previewUrl = `${config.web.host}:${config.web.port}/bill/${billInsert.date}/${billInsert.billNumber.split('/').pop()}`;
      const emailBody = `
        <p>Dear ${options.customerName},</p>
        <p>Please find attached your invoice <strong>${billInsert.billNumber}</strong>.</p>
        <div style="margin:20px 0;">${html}</div>
        <p><a href="${previewUrl}">View this invoice online</a></p>
      `;

      // ---------- Send email via failover ----------
      const mailResult = await sendWithFailover(
        options.recipient, options.subject, emailBody, user.id, correlationId, null, attachments
      );

      if (mailResult.success) {
        updateBillLog(billInsert.id, { status: 'success' });
        await replyFn(`📧 Invoice ${billInsert.billNumber} sent to ${options.recipient}`);
      } else {
        updateBillLog(billInsert.id, { status: 'failed' });
        await replyFn(`❌ All providers failed. Invoice saved with ID ${billInsert.billNumber}.`);
      }
    } catch (error) {
      logError('BILL', `Error: ${error.message}`, correlationId);
      updateBillLog(billInsert.id, { status: 'failed' });
      await replyFn(`❌ Error generating or sending invoice: ${error.message}`);
    }

    // ---------- Update rate limits ----------
    incrementRateLimits(user.id);
  }
};
