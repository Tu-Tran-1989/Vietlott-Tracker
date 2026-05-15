/**
 * SETUP — run this ONCE before using the bot
 *
 *   node setup.js          → login via QR + list your groups
 *   node setup.js --reauth → force re-login even if credentials exist
 *
 * After running, copy your group ID into config.json → "groupId"
 */

import { Zalo, ThreadType } from 'zca-js';
import fs     from 'fs';
import path   from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE = path.join(__dirname, 'credentials.json');

async function setup() {
  const forceReauth = process.argv.includes('--reauth');
  const zalo = new Zalo();
  let api;

  // ── LOGIN ────────────────────────────────────────────────────
  if (!forceReauth && fs.existsSync(CRED_FILE)) {
    console.log('📂  Found saved credentials, logging in…');
    try {
      const creds = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
      api = await zalo.loginCredentials(creds);
      console.log('✅  Logged in with saved session.\n');
    } catch {
      console.log('⚠️   Saved credentials expired, falling back to QR login…\n');
      api = await doQRLogin(zalo);
    }
  } else {
    api = await doQRLogin(zalo);
  }

  // ── LIST GROUPS ──────────────────────────────────────────────
  console.log('📋  Fetching your Zalo groups…\n');
  try {
    const groups = await api.getGroupList();
    if (!groups || groups.length === 0) {
      console.log('No groups found. Make sure you are a member of at least one group.');
      return;
    }

    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│  YOUR ZALO GROUPS                                   │');
    console.log('├──────────────────────────┬──────────────────────────┤');
    console.log('│  Group Name              │  Group ID                │');
    console.log('├──────────────────────────┼──────────────────────────┤');
    for (const g of groups) {
      const name = (g.name || 'Unnamed').substring(0, 24).padEnd(24);
      const id   = String(g.groupId || g.id || '').padEnd(24);
      console.log(`│  ${name}  │  ${id}  │`);
    }
    console.log('└──────────────────────────┴──────────────────────────┘');
    console.log('\n👉  Copy the Group ID of your target group into config.json → "groupId"\n');
  } catch (err) {
    console.error('❌  Could not fetch groups:', err.message);
    console.log('    Try listening for a message from the group instead:\n');
    console.log('    Send any message in your Zalo group, then check the console output below.\n');

    // Fallback: listen for one message to extract groupId
    await listenForGroupMessage(api);
  }
}

async function doQRLogin(zalo) {
  const qrFile = path.join(__dirname, 'qr.png');

  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  ZALO QR LOGIN');
  console.log('════════════════════════════════════════════');
  console.log('  1. Open Zalo on your phone');
  console.log('  2. Tap the  [ ⊞ ]  scan icon (top-right)');
  console.log('  3. Scan the QR code from the image below');
  console.log('');
  console.log(`  QR image: ${qrFile}`);
  console.log('════════════════════════════════════════════');
  console.log('  Waiting for scan…');
  console.log('');

  // Start login — QR saved to file
  const loginPromise = zalo.loginQR({ qrPath: qrFile });

  // Auto-open the PNG on Windows after a short delay (so file is written first)
  setTimeout(() => {
    exec(`start "" "${qrFile}"`, err => {
      if (!err) console.log('  📂  QR image opened automatically — scan it with Zalo.');
    });
  }, 1500);

  const api = await loginPromise;

  // Save credentials for future runs
  const creds = {
    cookie:    api.cookie?.toJSON?.()?.cookies ?? [],
    imei:      api.imei,
    userAgent: api.userAgent,
  };
  fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
  console.log('\n✅  QR login successful. Credentials saved to credentials.json\n');
  return api;
}

async function listenForGroupMessage(api) {
  console.log('👂  Listening for incoming messages (send any message in your group)…');
  const { listener } = api;
  listener.on('message', (msg) => {
    if (msg.type === ThreadType.Group) {
      console.log('\n✅  Found group!');
      console.log(`    Name    : ${msg.data?.groupName || '(unknown)'}`);
      console.log(`    Group ID: ${msg.threadId}`);
      console.log('\n👉  Copy this Group ID into config.json → "groupId"\n');
      process.exit(0);
    }
  });
  listener.start();
}

setup().catch(err => {
  console.error('❌  Setup failed:', err.message);
  process.exit(1);
});
