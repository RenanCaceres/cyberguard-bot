// Validações de formato dos dados coletados no onboarding

function validarCPF(valor) {
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(valor.trim());
}

// dd/MM/aaaa, checando também se é uma data de calendário válida
function validarData(valor) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!match) return false;

  const [, diaStr, mesStr, anoStr] = match;
  const dia = parseInt(diaStr, 10);
  const mes = parseInt(mesStr, 10);
  const ano = parseInt(anoStr, 10);

  if (mes < 1 || mes > 12) return false;

  const data = new Date(ano, mes - 1, dia);
  // new Date "corrige" datas inválidas (ex: 31/02) rolando pro mês seguinte;
  // comparamos os componentes de volta pra pegar isso
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

// Rua/Avenida NOME, [nº] N° - BAIRRO — o "nº"/"n°"/"no" antes do número é opcional
function validarEndereco(valor) {
  return /^(Rua|Av\.?|Avenida)\s+.+,\s*(n[ºo°]\.?\s*)?\d+[A-Za-z]?\s*-\s*.+$/i.test(valor.trim());
}

function validarRA(valor) {
  return /^\d+$/.test(valor.trim());
}

function naoVazio(valor) {
  return valor.trim().length > 0;
}

module.exports = { validarCPF, validarData, validarEndereco, validarRA, naoVazio };
