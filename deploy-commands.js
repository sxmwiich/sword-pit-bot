require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = '1374735135420977183'; // Your Discord application ID
const guildId = '1371312134868308071';  // Your Discord server (guild) ID

const commands = [
  new SlashCommandBuilder()
    .setName('teleport')
    .setDescription('Teleport a mod to a player')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('Player name to teleport to')
        .setRequired(true)
    )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
