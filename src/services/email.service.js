const net = require('net');
const tls = require('tls');
const {
  EMAIL_DELIVERY_MODE,
  EMAIL_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  isProductionRuntime
} = require('../config/env');

function isSmtpConfigured() {
  return EMAIL_DELIVERY_MODE === 'smtp' && Boolean(SMTP_HOST);
}

function isSimulatedEmail() {
  return !isSmtpConfigured();
}

function encodeHeader(value) {
  return /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
    : value;
}

function normalizeAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function dotStuff(text) {
  return String(text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function createSmtpSession(socket) {
  let buffer = '';
  const lines = [];

  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      lines.push(line);
    }
  });

  function readResponse() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout ao conversar com SMTP.')), 15000);
      const check = () => {
        const last = lines[lines.length - 1];
        if (last && /^\d{3}\s/.test(last)) {
          clearTimeout(timer);
          const responseLines = lines.splice(0, lines.length);
          const code = Number(last.slice(0, 3));
          return resolve({ code, text: responseLines.join('\n') });
        }
        setTimeout(check, 20);
      };
      check();
    });
  }

  async function command(text, expected = [250]) {
    socket.write(`${text}\r\n`);
    const response = await readResponse();
    if (!expected.includes(response.code)) throw new Error(response.text);
    return response;
  }

  return { command, readResponse };
}

async function connectSmtp() {
  const socket = SMTP_SECURE
    ? tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST })
    : net.connect({ host: SMTP_HOST, port: SMTP_PORT });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const session = createSmtpSession(socket);
  const greeting = await session.readResponse();
  if (greeting.code !== 220) throw new Error(greeting.text);

  let ehlo = await session.command(`EHLO ${SMTP_HOST}`, [250]);
  if (!SMTP_SECURE && /STARTTLS/i.test(ehlo.text)) {
    await session.command('STARTTLS', [220]);
    const secureSocket = tls.connect({ socket, servername: SMTP_HOST });
    await new Promise((resolve, reject) => {
      secureSocket.once('secureConnect', resolve);
      secureSocket.once('error', reject);
    });
    const secureSession = createSmtpSession(secureSocket);
    ehlo = await secureSession.command(`EHLO ${SMTP_HOST}`, [250]);
    return { socket: secureSocket, session: secureSession };
  }

  return { socket, session };
}

async function sendSmtpEmail({ to, subject, text }) {
  const { socket, session } = await connectSmtp();
  try {
    if (SMTP_USER && SMTP_PASS) {
      const auth = Buffer.from(`\u0000${SMTP_USER}\u0000${SMTP_PASS}`, 'utf8').toString('base64');
      await session.command(`AUTH PLAIN ${auth}`, [235]);
    }

    const fromAddress = normalizeAddress(EMAIL_FROM);
    const toAddress = normalizeAddress(to);
    await session.command(`MAIL FROM:<${fromAddress}>`, [250]);
    await session.command(`RCPT TO:<${toAddress}>`, [250, 251]);
    await session.command('DATA', [354]);
    socket.write([
      `From: ${EMAIL_FROM}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      dotStuff(text),
      '.'
    ].join('\r\n') + '\r\n');
    const response = await session.readResponse();
    if (response.code !== 250) throw new Error(response.text);
    await session.command('QUIT', [221]).catch(() => {});
    return { delivered: true, simulated: false, message: 'E-mail enviado via SMTP.' };
  } finally {
    socket.end();
  }
}

async function sendEmail({ to, subject, text }) {
  if (!isSmtpConfigured()) {
    console.log(`[email:simulated] To: ${to} | Subject: ${subject}\n${text}`);
    return {
      delivered: false,
      simulated: true,
      message: isProductionRuntime
        ? 'SMTP nao configurado. E-mail registrado em modo simulado.'
        : 'E-mail simulado em ambiente de teste.'
    };
  }

  return sendSmtpEmail({ to, subject, text });
}

module.exports = {
  isSimulatedEmail,
  sendEmail
};
