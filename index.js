require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    EmbedBuilder 
} = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

// --- CONFIG ---
const { DISCORD_TOKEN, GUILD_ID, VERIFIED_ROLE_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, PORT, BASE_URL } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Error: ข้อมูลใน .env ไม่ครบ");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, 
    ]
});

client.on('ready', async () => {
    console.log(`🤖 Bot logged in as ${client.user.tag}`);

    const commands = [
        {
            name: 'setuprole',
            description: 'Setup verify button',
        }
    ];

    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            await guild.commands.set(commands);
            console.log('✅ Slash Command Registered');
        }
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand() && interaction.commandName === 'setuprole') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Permission Denied', ephemeral: true });
        }

        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Verify Identity')
                    .setStyle(ButtonStyle.Link)
                    .setURL(oauthUrl)
            );

        await interaction.channel.send({ 
            content: 'กดปุ่มด้านล่างเพื่อยืนยันตัวตน', 
            components: [row] 
        });

        await interaction.reply({ 
            content: '✅ ติดตั้งปุ่มเรียบร้อยแล้ว', 
            ephemeral: true 
        });
    }
});

client.login(DISCORD_TOKEN);

// --- WEB SERVER ---
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('No code provided');

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
                scope: 'identify',
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) return res.send('Error getting token');

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        res.redirect(`/?id=${userData.id}`);

    } catch (error) {
        console.error(error);
        res.send('Authentication Failed');
    }
});

// API ให้ยศ + ส่ง DM (ส่วนที่แก้ไข)
app.post('/api/verify', async (req, res) => {
    const { userId, username } = req.body;

    if (!userId || !username) return res.status(400).json({ success: false, message: 'Missing data' });

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userId);

        if (member) {
            // 1. เปลี่ยนชื่อ
            await member.setNickname(username).catch(e => console.log(`Cannot set nickname: ${e.message}`));
            
            // 2. ให้ยศ
            await member.roles.add(VERIFIED_ROLE_ID).catch(e => {
                console.log(`Cannot add role: ${e.message}`);
                throw new Error("Role Error");
            });

            // 3. ส่ง DM หาผู้ใช้ (แต่งสวยเหมือนรูปตัวอย่าง) 📨
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xFF0000) // สีแดง
                    .setTitle('VERIFICATION SUCCESS ⚠️') // หัวข้อใหญ่
                    .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
                    .setDescription(`
ยืนยันตัวตนรับยศเรียบร้อยแล้ว ❗️

\`\`\`text
รายละเอียดสิทธิพิเศษที่คุณได้รับ 🌐
- ยินดีต้อนรับทุกท่าน 0x Discord
- มี Script Five M มากมายทั้งฟรี และ เสียตัง
- หากอยากได้ประสบการณ์ในการเปิด Server FiveM ทักได้เลย
\`\`\`

## 🥋 DISCORD

https://discord.gg/NaAX3K5mHF

📌 **PREVIEW**
`)
                    .setImage('https://img5.pic.in.th/file/secure-sv1/12c4ba8c-9a3e-45c2-99f3-37169bace988.png') // ⚠️ เปลี่ยนลิงก์รูปตรงนี้เป็นรูปที่คุณต้องการ
                    .setFooter({ text: guild.name })
                    .setTimestamp();

                await member.send({ embeds: [dmEmbed] });
                console.log(`Sent DM to ${username}`);
            } catch (dmError) {
                console.log(`Could not send DM to ${username}: User might have DMs closed.`);
            }

            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error processing request' });
    }
});

app.listen(PORT, () => {
    console.log(`🌍 Server running at ${BASE_URL}`);
});
