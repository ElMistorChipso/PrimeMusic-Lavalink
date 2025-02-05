const { Riffy } = require("riffy");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { queueNames, requesters } = require("./commands/play");
const { Dynamic } = require("musicard");
const config = require("./config.js");
const musicIcons = require('./UI/icons/musicicons.js');
const colors = require('./UI/colors/colors');
const fs = require("fs");
const path = require("path");
const { autoplayCollection } = require('./mongodb.js');

async function envoyerMessageAvecVerificationPermissions(channel, embed, attachment, actionRow1, actionRow2) {
    try {
        const permissions = channel.permissionsFor(channel.guild.members.me);
        if (!permissions.has(PermissionsBitField.Flags.SendMessages) ||
            !permissions.has(PermissionsBitField.Flags.EmbedLinks) ||
            !permissions.has(PermissionsBitField.Flags.AttachFiles) ||
            !permissions.has(PermissionsBitField.Flags.UseExternalEmojis)) {
            console.error("Le bot n'a pas les permissions nécessaires pour envoyer des messages dans ce canal.");
            return;
        }

        const message = await channel.send({
            embeds: [embed],
            files: [attachment],
            components: [actionRow1, actionRow2]
        });
        return message;
    } catch (error) {
        console.error("Erreur lors de l'envoi du message :", error.message);
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription("⚠️ **Impossible d'envoyer le message. Vérifiez les permissions du bot.**");
        await channel.send({ embeds: [errorEmbed] });
    }
}

function initialiserLecteur(client) {
    const nodes = config.nodes.map(node => ({
        name: node.name,
        host: node.host,
        port: node.port,
        password: node.password,
        secure: node.secure,
        reconnectTimeout: 5000,
        reconnectTries: Infinity
    }));

    client.riffy = new Riffy(client, nodes, {
        send: (payload) => {
            const guildId = payload.d.guild_id;
            if (!guildId) return;

            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        defaultSearchPlatform: "ytmsearch",
        restVersion: "v4",
    });

    let currentTrackMessageId = null;
    let collector = null;

    client.riffy.on("nodeConnect", node => {
        console.log(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.green}Nœud ${node.name} connecté ✅${colors.reset}`);
    });
    
    client.riffy.on("nodeError", (node, error) => {
        console.log(`${colors.cyan}[ LAVALINK ]${colors.reset} ${colors.red}Erreur du nœud ${node.name} ❌ | ${error.message}${colors.reset}`);
    });

    client.riffy.on("trackStart", async (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        const trackUri = track.info.uri;
        const requester = requesters.get(trackUri);

        try {
            const musicard = await Dynamic({
                thumbnailImage: track.info.thumbnail || 'https://example.com/default_thumbnail.png',
                backgroundColor: '#070707',
                progress: 10,
                progressColor: '#FF7A00',
                progressBarColor: '#5F2D00',
                name: track.info.title,
                nameColor: '#FF7A00',
                author: track.info.author || 'Artiste inconnu',
                authorColor: '#696969',
            });

            const cardPath = path.join(__dirname, 'musicard.png');
            fs.writeFileSync(cardPath, musicard);

            const attachment = new AttachmentBuilder(cardPath, { name: 'musicard.png' });
            const embed = new EmbedBuilder()
                .setAuthor({ 
                    name: 'Lecture en cours...', 
                    iconURL: musicIcons.playerIcon,
                    url: config.SupportServer
                })
                .setFooter({ text: `Développé par SSRR | Prime Music v1.2`, iconURL: musicIcons.heartIcon })
                .setTimestamp()
                .setDescription(
                    `- **Titre :** [${track.info.title}](${track.info.uri})\n` +
                    `- **Auteur :** ${track.info.author || 'Artiste inconnu'}\n` +
                    `- **Durée :** ${formaterDuree(track.info.length)}\n` +
                    `- **Demandé par :** ${requester}\n` +
                    `- **Source :** ${track.info.sourceName}\n` +
                    '**- Contrôles :**\n 🔁 `Répéter`, ❌ `Désactiver`, ⏭️ `Passer`, 📜 `File d'attente`, 🗑️ `Vider`\n ⏹️ `Arrêter`, ⏸️ `Pause`, ▶️ `Reprendre`, 🔊 `Vol +`, 🔉 `Vol -`')
                .setImage('attachment://musicard.png')
                .setColor('#FF7A00');

            const actionRow1 = creerLigneAction1(false);
            const actionRow2 = creerLigneAction2(false);

            const message = await envoyerMessageAvecVerificationPermissions(channel, embed, attachment, actionRow1, actionRow2);
            if (message) {
                currentTrackMessageId = message.id;

                if (collector) collector.stop(); 
                collector = configurerCollecteur(client, player, channel, message);
            }

        } catch (error) {
            console.error("Erreur lors de la création ou de l'envoi de la carte musicale :", error.message);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription("⚠️ **Impossible de charger la carte du morceau. Poursuite de la lecture...**");
            await channel.send({ embeds: [errorEmbed] });
        }
    });
}

function formaterDuree(ms) {
    const secondes = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const heures = Math.floor((ms / (1000 * 60 * 60)) % 24);

    return [
        heures > 0 ? `${heures}h` : null,
        minutes > 0 ? `${minutes}m` : null,
        `${secondes}s`,
    ]
        .filter(Boolean)
        .join(' ');
}

module.exports = { initialiserLecteur };
