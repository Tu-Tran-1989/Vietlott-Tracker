/**
 * SETUP — run this ONCE before using the bot
 *
 *   node setup.js          → login via QR + list your groups
 *   node setup.js --reauth → force re-login even if credentials exist
 */

import { Zalo, ThreadType, LoginQRCallbackEventType } from 'zca-js';
import fs      from 'fs';
import path    from 'path';
import { exec } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require    = createRequire(import.meta.url);
const qrTerminal = require('qrcode-terminal');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE = path.join(__dirname, 'credentials.json');
const QR_FILE   = path.join(__dirname, 'qr.png');

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
      console.log('Try sending a message in your group and re-run with --reauth.');
      return;
    }

    console.log('┌──────────────────────────────┬──────────────────────────┐');
    console.log('│  Group Name                  │  Group ID                │');
    console.log('├──────────────────────────────┼──────────────────────────┤');
    for (const g of groups) {
      const name = (g.name || 'Unnamed').substring(0, 28).padEnd(28);
      const id   = String(g.groupId || g.id || '').padEnd(24);
      console.log(`│  ${name}  │  ${id}  │`);
    }
    console.log('└──────────────────────────────┴──────────────────────────┘');
    console.log('\n👉  Copy the Group ID into config.json → "groupId"\n');
  } catch (err) {
    console.error('❌  Could not fetch groups:', err.message);
    console.log('\nFallback: send any message in your Zalo group,');
    console.log('the Group ID will be printed here automatically.\n');
    await listenForGroupMessage(api);
  }
}

// ── QR LOGIN ─────────────────────────────────────────────────────────────────
function doQRLogin(zalo) {
  return new Promise((resolve, reject) => {
    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('  SCAN THIS QR CODE WITH YOUR ZALO APP');
    console.log('══════════════════════════════════════════════════');
    console.log('  In Zalo app: tap the  ⊞  icon (top-right)');
    console.log('══════════════════════════════════════════════════\n');

    zalo.loginQR({ qrPath: QR_FILE }, async (event) => {
      switch (event.type) {

        case LoginQRCallbackEventType.QRCodeGenerated: {
          // 1) ASCII QR in terminal — scan directly from screen
          qrTerminal.generate(event.code, { small: true }, (qr) => {
            console.log(qr);
          });

          // 2) Save PNG and auto-open it
          try {
            event.actions?.saveToFile?.();
            console.log(`\n📄  QR image saved: ${QR_FILE}`);
            exec(`start "" "${QR_FILE}"`); // open in default image viewer
          } catch {}

          console.log('\n⏳  Waiting for you to scan… (expires in ~100 seconds)\n');
          break;
        }

        case LoginQRCallbackEventType.QRCodeExpired: {
          console.log('⚠️   QR expired. Generating a new one…\n');
          event.actions?.retry?.();
          break;
        }

        case LoginQRCallbackEventType.QRCodeScanned: {
          console.log(`\n📱  Scanned by: ${event.userInfo?.name || 'user'}`);
          console.log('    Please confirm on your phone…');
          break;
        }

        case LoginQRCallbackEventType.QRCodeDeclined: {
          console.log('\n❌  Login declined on phone. Retrying…\n');
          event.actions?.retry?.();
          break;
        }

        case LoginQRCallbackEventType.GotLoginInfo: {
          const creds = {
            cookie:    event.cookies ?? [],
            imei:      event.imei,
            userAgent: event.userAgent,
          };
          fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
          console.log('\n✅  Login successful! Credentials saved.\n');

          // Re-create API instance with saved credentials
          const freshApi = await new Zalo().loginCredentials(creds).catch(reject);
          if (freshApi) resolve(freshApi);
          break;
        }
      }
    }).catch(reject);
  });
}

// ── FALLBACK: listen for a group message to get group ID ─────────────────────
async function listenForGroupMessage(api) {
  console.log('👂  Listening for messages… send anything in your target Zalo group.');
  const { listener } = api;
  listener.on('message', (msg) => {
    if (msg.type === ThreadType.Group) {
      console.log('\n✅  Group detected!');
      console.log(`    Name     : ${msg.data?.groupName || '(unknown)'}`);
      console.log(`    Group ID : ${msg.threadId}`);
      console.log('\n👉  Copy this Group ID into config.json → "groupId"\n');
      process.exit(0);
    }
  });
  listener.start();
}

setup().catch(err => {
  console.error('\n❌  Setup failed:', err.message);
  console.error('    Make sure you ran:  npm install');
  process.exit(1);
});
