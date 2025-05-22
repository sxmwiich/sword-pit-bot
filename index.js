require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const express = require('express');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
const app = express();

const PORT = 3000;
const ALERT_CHANNEL_ID = '1374665649082597416';

app.use(express.json());

// In-memory queue for teleport requests (simple, reset on server restart)
let pendingTeleports = [];

// --- Express Routes ---

// Health check
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// Incoming alerts from Roblox
app.post('/alert', async (req, res) => {
  const data = req.body;
  if (!data.player || !data.flagType || !data.joinUrl) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
    if (!channel) return res.status(500).send('Alert channel not found');

    const embed = new EmbedBuilder()
      .setTitle('🚨 Suspicious Activity Detected')
      .setColor(0xE74C3C)
      .addFields(
        { name: 'Player', value: `${data.player} (${data.userId})`, inline: true },
        { name: 'Flag Type', value: data.flagType, inline: true },
        { name: 'Details', value: data.details || 'No details provided' }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_alert')
        .setLabel('Claim Alert')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    res.status(200).send('Alert sent to Discord');
  } catch (error) {
    console.error('Error sending alert:', error);
    res.status(500).send('Internal server error');
  }
});

// Discord bot posts teleport requests here
app.post('/request-teleport', (req, res) => {
  const { modUsername, targetUsername } = req.body;
  if (!modUsername || !targetUsername) {
    return res.status(400).json({ success: false, message: "Missing modUsername or targetUsername" });
  }

  // Add to queue
  pendingTeleports.push({ modUsername, targetUsername });
  console.log(`Teleport queued: mod=${modUsername} target=${targetUsername}`);

  res.json({ success: true, message: "Teleport request queued." });
});

// Roblox server polls this endpoint to get teleport requests
app.get('/poll-teleport', (req, res) => {
  const requests = [...pendingTeleports];
  pendingTeleports = []; // clear queue after sending
  res.json({ requests });
});

// --- Discord Bot ---

const claimedAlerts = new Set();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === 'claim_alert') {
      const alertId = interaction.message.id;

      if (claimedAlerts.has(alertId)) {
        await interaction.reply({ content: 'This alert has already been claimed.', ephemeral: true });
        return;
      }

      claimedAlerts.add(alertId);

      const disabledButton = ButtonBuilder.from(interaction.component)
        .setDisabled(true)
        .setLabel('Claimed');

      const row = new ActionRowBuilder().addComponents(disabledButton);

      await interaction.update({
        components: [row],
        content: `Alert claimed by <@${interaction.user.id}>`,
        embeds: interaction.message.embeds
      });
    }
  } else if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'teleport') {
      const hasPermission = interaction.member.roles.cache.some(role => role.name === 'Game Developers');
      if (!hasPermission) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      const targetPlayerName = interaction.options.getString('player');
      const moderatorUsername = interaction.user.username;

      await interaction.reply(`🚀 Sending teleport request to **${targetPlayerName}**...`);

      try {
        // Post request to backend queue
        const response = await axios.post('http://localhost:3000/request-teleport', {
          modUsername: moderatorUsername,
          targetUsername: targetPlayerName
        });

        if (response.data.success) {
          await interaction.followUp({ content: `✅ ${response.data.message}`, ephemeral: true });
        } else {
          await interaction.followUp({ content: `⚠️ ${response.data.message}`, ephemeral: true });
        }
      } catch (error) {
        console.error('Teleport request failed:', error.message);
        await interaction.followUp({ content: `❌ Failed to send teleport request.`, ephemeral: true });
      }
    }
  }
});

// --- Login Discord bot ---
client.login(process.env.DISCORD_TOKEN);
