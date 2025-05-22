require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// 🔍 Log public IP for Roblox API allowlist
(async () => {
  try {
    const res = await axios.get('https://api.ipify.org?format=json');
    console.log(`🌐 Public IP for Open Cloud: ${res.data.ip}`);
  } catch (err) {
    console.error('Failed to fetch public IP:', err.message);
  }
})();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
const app = express();

const PORT = 3000;
const ALERT_CHANNEL_ID = '1374665649082597416';
const UNIVERSE_ID = process.env.UNIVERSE_ID;
const OPEN_CLOUD_API_KEY = process.env.OPEN_CLOUD_API_KEY;

app.use(bodyParser.json());

//
// 🚨 Alert webhook from Roblox to Discord
//

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

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

//
// ✅ Ready Event
//
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
  });
});

//
// 🛡️ Track claimed alerts to prevent double claims
//
const claimedAlerts = new Set();

//
// 🎯 Button Interaction: Claim Alert
//
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'claim_alert') {
    const alertId = interaction.message.id;

    if (claimedAlerts.has(alertId)) {
      await interaction.reply({ content: 'This alert has already been claimed.', ephemeral: true });
      return;
    }

    claimedAlerts.add(alertId);

    const button = interaction.component;
    const disabledButton = ButtonBuilder.from(button).setDisabled(true).setLabel('Claimed');
    const row = new ActionRowBuilder().addComponents(disabledButton);

    await interaction.update({
      components: [row],
      content: `Alert claimed by <@${interaction.user.id}>`,
      embeds: interaction.message.embeds
    });
  }
});

//
// ✈️ /teleport Command
//
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'teleport') return;

  // Check for 'Game Developers' role
  const hasPermission = interaction.member.roles.cache.some(role => role.name === 'Game Developers');
  if (!hasPermission) {
    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  const targetPlayerName = interaction.options.getString('player');
  const moderatorUsername = interaction.user.username;

  await interaction.reply(`🚀 Sending teleport request to **${targetPlayerName}**...`);

  try {
    const response = await axios.post(
      `https://apis.roblox.com/universes/${UNIVERSE_ID}/functions/RequestTeleportFromBot/invoke`,
      {
        arguments: [moderatorUsername, targetPlayerName]
      },
      {
        headers: {
          'x-api-key': OPEN_CLOUD_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    // Assuming your Roblox RemoteFunction returns a JSON { success: true/false, message: "..." }
    if (response.data.success) {
      await interaction.followUp({ content: `✅ ${response.data.message}`, ephemeral: true });
    } else {
      await interaction.followUp({ content: `⚠️ ${response.data.message}`, ephemeral: true });
    }
  } catch (error) {
    console.error('Teleport request failed:', error.response?.data || error.message);
    await interaction.followUp({
      content: `❌ Failed to send teleport request: ${error.response?.data?.message || error.message}`,
      ephemeral: true
    });
  }
});

//
// 🔐 Login Discord bot
//
client.login(process.env.DISCORD_TOKEN);
