'use strict';

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

const PORT = 4567;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

function atualizarEnv(caminhoEnv, refreshToken) {
  if (!fs.existsSync(caminhoEnv)) return;
  let content = fs.readFileSync(caminhoEnv, 'utf8');
  if (content.includes('GOOGLE_REFRESH_TOKEN=')) {
    content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
  } else {
    content += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  }
  fs.writeFileSync(caminhoEnv, content, 'utf8');
  console.log(`[env] GOOGLE_REFRESH_TOKEN salvo em ${caminhoEnv}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    if (reqUrl.pathname === '/oauth2callback') {
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Erro na autorização: ${error}</h2>`);
        console.error('Erro na autorização:', error);
        server.close();
        process.exit(1);
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h1 style="color: #22c55e;">🎉 Autorização concluída com sucesso!</h1>
            <p>O token do Google Drive foi configurado. Você já pode fechar esta aba do navegador.</p>
          </div>
        `);

        console.log('\n✅ Código de autorização recebido! Solicitando tokens...');
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
          console.warn('⚠️ Google não retornou refresh_token novo (provavelmente já consentido anteriormente).');
        } else {
          console.log('🔑 Refresh Token obtido com sucesso!');
          atualizarEnv(path.resolve('.env'), tokens.refresh_token);
        }

        server.close(() => {
          console.log('\n🚀 Servidor de autorização encerrado. Pronto para sincronizar!\n');
          process.exit(0);
        });
      }
    }
  } catch (err) {
    console.error('Erro ao processar callback:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Erro interno');
  }
});

server.listen(PORT, () => {
  console.log('================================================================');
  console.log('🔗 ABRA O LINK ABAIXO NO NAVEGADOR PARA AUTORIZAR O DRIVE:');
  console.log('================================================================\n');
  console.log(authUrl);
  console.log('\n================================================================');
  console.log(`Aguardando autorização em ${REDIRECT_URI}...`);
});
