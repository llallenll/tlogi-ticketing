# TLogi — Discord Ticket System

A simple and modern **Discord Ticket Bot + Web Dashboard**.  
This guide walks you through installation, setup, and running everything.


## 📥 1. Download the Bot

```bash
git clone https://github.com/llallenll/TLOGI_TICKET_DASHBOARD
cd TLOGI_TICKET_DASHBOARD
```

## 📦 2. Install Dependencies

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install
cd bot
npm install
```

## 🔐 3. Create Your .env File

```bash
#=============== MODE SWITCH ===============
# true  = use domains (FRONTEND_DOMAIN / API_DOMAIN)
# false = use HOST + FRONTEND_PORT / WEBHOOK_PORT
USE_DOMAIN=false
VITE_USE_DOMAIN=false #SAME AS USE_DOMAIN

#=============== DISCORD ===============

DISCORD_CLIENT_ID=client_id
DISCORD_CLIENT_SECRET=client_secret
DISCORD_BOT_TOKEN=bot_token
DISCORD_GUILD_ID=guild_id
DISCORD_TICKET_CATEGORY_ID=category_id
DISCORD_STAFF_ROLE_ID=staff_role_id

#=============== SESSION ===============

SESSION_SECRET=190910589013081490389401180498109348190489012384091849012830498132904819043891248910348

#=============== WEB | FRONTEND | API ===============

HOST=localhost
VITE_HOST=localhost #SAME AS HOST

FRONTEND_DOMAIN=https://mywebsite.com
API_DOMAIN=https://api.mywebsite.com

VITE_DOMAIN=mywebsite.com #SAME AS DOMAIN WITHOUT HTTP/HTTPS
VITE_API_DOMAIN=https://api.mywebsite.com #SAME AS API_DOMAIN

FRONTEND_PORT=5173
WEBHOOK_PORT=3001
VITE_WEBHOOK_PORT=3001 #SAME AS WEBHOOK PORT

#=============== BOT ===============

BOT_URL=http://localhost:30112 #LEAVE LOCALHOST UNLESS HOSTING BOT ELSEWHERE | PORT SAME AS BOT_WEBHOOK_PORT
BOT_WEBHOOK_PORT=30112

#=============== DATABASE ===============

DB_HOST=localhost
DB_PORT=3306
DB_USER=username
DB_PASS=password
DB_NAME=database
```

## 🗄️ 4. MySQL Setup + Import Database (OPTIONAL)

Install MySQL:
```bash
sudo apt install mysql-client-core-8.0
sudo apt install mysql-server
sudo service mysql start
```

Create Database:
```bash
sudo mysql
CREATE DATABASE s51_tlogi;
```

Create MySQL User:
```bash
CREATE USER 'myuser'@'localhost' IDENTIFIED BY 'mypassword';
GRANT ALL PRIVILEGES ON s51_tlogi.* TO 'myuser'@'localhost';
FLUSH PRIVILEGES;
```

Fix Authentication Issues:
```bash
ALTER USER 'myuser'@'localhost' IDENTIFIED WITH mysql_native_password BY 'mypassword';
FLUSH PRIVILEGES;
EXIT;
```

Import SQL File:
```bash
sudo mysql s51_tlogi < s51_tlogi.sql
```

## 🛠️ 5. Add Yourself as Super Admin

```bash
mysql -u myuser -p s51_tlogi
```

then run
```bash
INSERT INTO staff_users (discord_user_id, role, is_super_admin)
VALUES ('yourdiscordid', 'staff', 1);
EXIT;
```

## 🚀 6. Start the Bot + Dashboard

Start Service:
```bash
npm run dev:all
```

Add OAuth2 Redirects:
```bash
Visit: https://discord.com/developers
Navigate to OAuth2 -> Redirects
In your Command line you will see "Callback running on https://[Domain or IP]/auth/discord/callback"
Paste the url in Redirects
```

## 🌐 7. Open the Dashboard

```bash
http://localhost:5173
```

## ✅ All Set!
Your bot + dashboard should now be fully running.

## 📄 License
This project is licensed under the MIT License.
See the LICENSE file for full details.
