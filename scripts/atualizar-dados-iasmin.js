'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('../src/db');
const config = require('../src/config');
const { gerarTermo } = require('../src/termService');
const { registrarMembroAtivo } = require('../src/notionMembros');

const IASMIN_DISCORD_ID = '690543272673804358';
const DADOS_ATUALIZADOS = {
  estudante_utfpr: 'Não',
  instituicao: 'Universidade Federal do Cariri (UFCA)',
  endereco: 'R. Ten. Antônio João, 1',
  cidade: 'Crato',
  estado: 'CE',
};

async function main() {
  console.log('--- ATUALIZAÇÃO DE DADOS E REGENERAÇÃO DE TERMO: IASMIN ---');

  // 1. Verificar membro atual no banco
  const membroAtual = await db.getMembro(IASMIN_DISCORD_ID);
  if (!membroAtual) {
    throw new Error(`Membro com ID ${IASMIN_DISCORD_ID} não encontrado no banco de dados.`);
  }

  console.log(`Membro encontrado: ${membroAtual.nome} (Status atual: ${membroAtual.status})`);
  console.log('Dados anteriores:', {
    estudante_utfpr: membroAtual.estudante_utfpr,
    instituicao: membroAtual.instituicao,
    endereco: membroAtual.endereco,
    cidade: membroAtual.cidade,
    estado: membroAtual.estado,
  });

  // 2. Atualizar dados no banco de dados
  const prazoDias = config.prazoDias || 7;
  const novaDataLimite = new Date();
  novaDataLimite.setDate(novaDataLimite.getDate() + prazoDias);

  const queryUpdate = `
    UPDATE membros
    SET estudante_utfpr = $1,
        instituicao = $2,
        endereco = $3,
        cidade = $4,
        estado = $5,
        status = 'aguardando_assinatura',
        data_limite_assinatura = $6,
        lembrete_resolvido_manualmente = false
    WHERE discord_id = $7
    RETURNING *;
  `;

  const { rows } = await db.pool.query(queryUpdate, [
    DADOS_ATUALIZADOS.estudante_utfpr,
    DADOS_ATUALIZADOS.instituicao,
    DADOS_ATUALIZADOS.endereco,
    DADOS_ATUALIZADOS.cidade,
    DADOS_ATUALIZADOS.estado,
    novaDataLimite,
    IASMIN_DISCORD_ID,
  ]);

  const membroAtualizado = rows[0];
  console.log('✅ Banco de dados atualizado com sucesso:');
  console.log({
    nome: membroAtualizado.nome,
    estudante_utfpr: membroAtualizado.estudante_utfpr,
    instituicao: membroAtualizado.instituicao,
    endereco: membroAtualizado.endereco,
    cidade: membroAtualizado.cidade,
    estado: membroAtualizado.estado,
    status: membroAtualizado.status,
    data_limite_assinatura: membroAtualizado.data_limite_assinatura,
  });

  // 3. Backup do termo assinado antigo (se existir)
  if (membroAtual.termo_arquivo_path && fs.existsSync(membroAtual.termo_arquivo_path)) {
    const dirTermo = path.dirname(membroAtual.termo_arquivo_path);
    const ext = path.extname(membroAtual.termo_arquivo_path);
    const base = path.basename(membroAtual.termo_arquivo_path, ext);
    const backupPath = path.join(dirTermo, `${base}_desatualizado${ext}`);
    try {
      fs.copyFileSync(membroAtual.termo_arquivo_path, backupPath);
      console.log(`📦 Backup do termo anterior criado em: ${backupPath}`);
    } catch (errBackup) {
      console.warn('Aviso ao criar backup do termo antigo:', errBackup.message);
    }
  }

  // 4. Gerar o novo termo em PDF
  console.log('Gerando novo termo em PDF...');
  const caminhoNovoTermo = await gerarTermo(membroAtualizado);
  console.log(`✅ Novo termo gerado em: ${caminhoNovoTermo}`);

  // 5. Conectar no Discord para enviar mensagem e novo termo por DM
  console.log('Conectando ao Discord...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ],
  });

  await client.login(config.discordToken);
  console.log(`Conectado como ${client.user.tag}`);

  try {
    const usuarioDiscord = await client.users.fetch(IASMIN_DISCORD_ID);
    if (!usuarioDiscord) {
      console.warn(`⚠️ Não foi possível obter o usuário Discord ${IASMIN_DISCORD_ID}.`);
    } else {
      const mensagemDM =
        `Olá, ${membroAtualizado.nome.split(' ')[0]}! Tudo bem?\n\n` +
        `Atualizamos o seu cadastro no sistema do CyberGuard com as informações corretas:\n` +
        `• **Instituição de Ensino:** ${membroAtualizado.instituicao} *(Estudante UTFPR: Não)*\n` +
        `• **Endereço Residencial:** ${membroAtualizado.endereco} - ${membroAtualizado.cidade} - ${membroAtualizado.estado}\n\n` +
        `Segue em anexo o seu novo **Termo de Adesão de Voluntariado** corrigido. 📄\n\n` +
        `**Passo a passo para assinatura:**\n` +
        `1. Abra o PDF anexo e preencha o campo **"Data:"** com a data de hoje (dd/mm/aaaa) — é o único campo em branco.\n` +
        `2. Envie esse mesmo PDF para assinatura digital no **gov.br** (assinador oficial de documentos).\n` +
        `3. Envie o PDF já assinado de volta aqui mesmo nesta mensagem privada (DM) dentro do prazo de **${prazoDias} dias**.\n\n` +
        `Não se preocupe: seus cargos e acessos no servidor permanecem exatamente os mesmos. Qualquer dúvida, estamos à disposição!`;

      await usuarioDiscord.send({
        content: mensagemDM,
        files: [caminhoNovoTermo],
      });
      console.log(`✅ Novo termo enviado com sucesso para a DM de ${membroAtualizado.nome} (<@${IASMIN_DISCORD_ID}>)!`);
    }

    // 6. Notificar canal do RH
    if (config.channelRhId) {
      try {
        const canalRh = await client.channels.fetch(config.channelRhId);
        if (canalRh) {
          await canalRh.send({
            content:
              `📋 **Atualização Cadastral e Novo Termo Emitido**\n` +
              `• **Membro:** <@${IASMIN_DISCORD_ID}> (${membroAtualizado.nome})\n` +
              `• **Instituição:** ${membroAtualizado.instituicao} *(Estudante UTFPR: ${membroAtualizado.estudante_utfpr})*\n` +
              `• **Endereço:** ${membroAtualizado.endereco} - ${membroAtualizado.cidade} - ${membroAtualizado.estado}\n` +
              `• **Status no banco:** \`aguardando_assinatura\`\n` +
              `• **Prazo de entrega:** até <t:${Math.floor(novaDataLimite.getTime() / 1000)}:D>\n` +
              `📌 *O novo termo foi gerado e enviado diretamente na DM do membro para assinatura via gov.br.*`,
          });
          console.log('✅ Notificação enviada para o canal do RH.');
        }
      } catch (errRh) {
        console.warn('Aviso ao notificar canal do RH:', errRh.message);
      }
    }
  } finally {
    client.destroy();
  }

  // 7. Atualizar no Notion
  try {
    console.log('Sincronizando atualização no Notion...');
    await registrarMembroAtivo(membroAtualizado);
    console.log('✅ Dados sincronizados no Notion.');
  } catch (errNotion) {
    console.warn('Aviso ao sincronizar com Notion:', errNotion.message);
  }

  console.log('\n--- PROCESSO CONCLUÍDO COM SUCESSO ---');
  await db.pool.end();
}

main().catch((err) => {
  console.error('❌ Erro durante a execução:', err);
  process.exit(1);
});
