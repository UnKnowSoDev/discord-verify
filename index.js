require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

// --- CONFIG ---
const { DISCORD_TOKEN, GUILD_ID, VERIFIED_ROLE_ID, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, PORT, BASE_URL } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Error: ข้อมูลใน .env ไม่ครบ (ต้องการ CLIENT_ID และ CLIENT_SECRET)");
    process.exit(1);
}

// --- DISCORD BOT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.on('ready', async () => {
    console.log(`🤖 Bot Ready: ${client.user.tag}`);
    const commands = [{ name: 'setuprole', description: 'Setup Verify Button (OAuth2)' }];
    const guild = client.guilds.cache.get(GUILD_ID);
    if(guild) await guild.commands.set(commands);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand() && interaction.commandName === 'setuprole') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({content:'❌ No Permission', ephemeral:true});

        // สร้าง URL สำหรับ Login with Discord
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Verify Identity') // ข้อความบนปุ่ม
                    .setStyle(ButtonStyle.Link)  // เป็นปุ่ม Link (กดแล้วเปิดเว็บเลย)
                    .setURL(oauthUrl)            // ลิงก์ไปหน้า Login
            );

        await interaction.channel.send({ content: 'กดปุ่มด้านล่างเพื่อยืนยันตัวตน', components: [row] });
        await interaction.reply({ content: '✅ ติดตั้งปุ่มแล้ว', ephemeral: true });
    }
});

client.login(DISCORD_TOKEN);

// --- WEB SERVER ---
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. หน้าเล่นเกม (จะรับ ID มาจาก Redirect)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. Callback จาก Discord (จุดสำคัญ!)
app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('No code provided');

    try {
        // 2.1 เอา Code ไปแลก Token
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
        if (tokenData.error) return res.send('Error getting token: ' + tokenData.error_description);

        // 2.2 เอา Token ไปดึง User ID
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        // 2.3 ได้ ID แล้ว! ส่งไปหน้าเกมเลย
        res.redirect(`/?id=${userData.id}`);

    } catch (error) {
        console.error(error);
        res.send('Authentication Failed');
    }
});

// 3. API สำหรับให้ยศ (ตอนชนะเกม)
app.post('/api/verify', async (req, res) => {
    const { userId, username } = req.body;
    // ... (ส่วนนี้เหมือนเดิม)
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userId);
        if (member) {
            await member.setNickname(username).catch(e=>console.log(e));
            await member.roles.add(VERIFIED_ROLE_ID).catch(e=>console.log(e));
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.listen(PORT || 3000, () => console.log(`🌍 Server running at ${BASE_URL}`));