#!/usr/bin/env bun
// Simple health-check CLI for the externally implemented PAI Voice Server
// Usage: server-health-check.ts [URL]
// If no URL is provided, reads PAI_VOICE_SERVER from env or defaults to http://localhost:8888

const DEFAULT = 'http://localhost:8888';
const arg1 = process.argv[2];
const arg2 = process.argv[3];
const rawBase = (arg1 && arg1.trim()) || process.env.PAI_VOICE_SERVER || DEFAULT;
// Strip a trailing /notify endpoint (and any following path) if present
const baseUrl = rawBase.replace(/\/notify(\/.*)?$/i, '').replace(/\/$/, '') || rawBase;
const SEND_TEST_NOTIFICATION = Boolean(arg2 && arg2.toLowerCase() === 'true');

function usage() {
  console.log('PAI Voice Server Health Check');
  console.log('Usage: server-health-check.ts [URL] [SEND_TEST_NOTIFICATION]');
  console.log('  If SEND_TEST_NOTIFICATION is true, sends a simple test notification to /notify using ELEVENLABS_VOICE_ID from env');
  console.log('Reads env PAI_VOICE_SERVER if no URL is provided. Defaults to', DEFAULT);
}

if (arg1 === '-h' || arg1 === '--help') {
  usage();
  process.exit(0);
}

async function fetchHealth(url) {
  const healthUrl = url.replace(/\/$/, '') + '/health';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { /* not JSON */ }

    return { ok: res.ok, status: res.status, statusText: res.statusText, text, parsed, url: healthUrl };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'timeout', message: 'Request timed out (5s) to ' + healthUrl };
    }
    return { error: 'network', message: err.toString() };
  }
}

console.log('Checking PAI Voice Server at', baseUrl);
fetchHealth(baseUrl).then(async (result) => {
  if (!result) {
    console.error('Unexpected error during health check');
    process.exit(3);
  }

  if (result.error) {
    if (result.error === 'timeout') console.error('ERROR:', result.message);
    else console.error('ERROR:', result.message);
    if (!SEND_TEST_NOTIFICATION) process.exit(3);
  } else if (result.ok) {
    console.log('OK: ' + result.url);
    if (result.parsed) console.log(JSON.stringify(result.parsed, null, 2));
    else console.log(result.text);
    if (!SEND_TEST_NOTIFICATION) process.exit(0);
  } else {
    console.error('ERROR: ' + result.status + ' ' + result.statusText);
    if (result.parsed) console.error(JSON.stringify(result.parsed, null, 2));
    else console.error(result.text);
    if (!SEND_TEST_NOTIFICATION) process.exit(2);
  }

  if (!SEND_TEST_NOTIFICATION) return;

  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    console.error('SEND_TEST_NOTIFICATION requested but ELEVENLABS_VOICE_ID is not set in environment');
    process.exit(4);
  }

  const notifyUrl = baseUrl.replace(/\/$/, '') + '/notify';
  const payloadBasic = { voice_id: voiceId, message: 'Test notification from server-health-check' };
  const emojiToEmotion: Record<string, string> = {
    '💥': 'excited', '🎉': 'celebration', '💡': 'insight', '🎨': 'creative',
    '✨': 'success', '📈': 'progress', '🔍': 'investigating', '🐛': 'debugging',
    '📚': 'learning', '🤔': 'pondering', '🎯': 'focused', '⚠️': 'caution', '🚨': 'urgent'
  };

  const payloadEmotion = { voice_id: voiceId, message: '💥 Test notification from server-health-check' };
  const payloadVoiceConfig = { voice_config: {
      "voice_id": voiceId,
      "voice_name": "Designer",
      "stability": 0.52,
      "similarity_boost": 0.80,
      "description": "Critic, measured - exacting UX/UI specialist"
    }, message: 'Test notification from server-health-check' };

  let payload = payloadVoiceConfig;
  console.log('Sending test notification with voiceid:', voiceId, 'to', notifyUrl);
  console.log('Notify POST payload:', JSON.stringify(payload));
  try {
    const res = await fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log('POST', notifyUrl, '->', res.status);
    try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch (e) { if (text) console.log(text); }
    process.exit(res.ok ? 0 : 2);
  } catch (err) {
    console.error('ERROR: Network error while POSTing to', notifyUrl);
    console.error(err.toString());
    process.exit(3);
  }
}).catch(() => {});
