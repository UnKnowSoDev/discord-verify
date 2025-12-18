require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    EmbedBuilder // <--- ต้องมีตัวนี้เพื่อสร้าง Embed สวยๆ
} = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

// --- CONFIG ---
const { DISCORD_TOKEN, GUILD_ID, VERIFIED_ROLE_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, PORT, BASE_URL } = process.env;

// ตรวจสอบค่า Config เบื้องต้น
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

        // URL สำหรับ Login
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

// ส่วนสำคัญ: Callback จาก Discord
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
        if (tokenData.error) return res.send('Error: ' + JSON.stringify(tokenData));

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

// ส่วนสำคัญ: API ให้ยศ + ส่ง DM
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

            // 3. (ใหม่) ส่ง DM หาผู้ใช้ ✉️
            const dmEmbed = new EmbedBuilder()
                .setTitle('✅ ยืนยันตัวตนสำเร็จ!')
                .setDescription(`ยินดีด้วยครับ คุณ **${username}** ได้รับการยืนยันตัวตนเรียบร้อยแล้ว\nขอให้สนุกกับการใช้งานเซิร์ฟเวอร์ครับ!`)
                .setColor(0x57F287) // สีเขียวสวยๆ
                .addFields({ 
                    name: '🔗 Community Link', 
                    value: '[คลิกเพื่อเข้าสู่ดิสคอร์ดหลัก](https://discord.gg/NaAX3K5mHF)' 
                })
                .setFooter({ text: 'Verified System', iconURL: guild.iconURL() })
                .setTimestamp();

            // ส่ง DM (ใส่ catch เผื่อคนปิด DM บอทจะได้ไม่พัง)
            await member.send({ embeds: [dmEmbed] }).catch(err => {
                console.log(`ส่ง DM ไม่ได้ (ผู้ใช้อาจปิด DM): ${err.message}`);
            });

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
