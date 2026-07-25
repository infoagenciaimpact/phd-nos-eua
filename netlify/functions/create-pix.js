// netlify/functions/create-pix.js
//
// Cria uma transacao Pix via API da UmbrellaPag.
// A chave privada (UMBRELLAPAG_API_KEY) fica em variavel de ambiente no Netlify,
// nunca no codigo do checkout. O front-end so chama esta function.

const API_BASE = 'https://api-gateway.umbrellapag.com/api';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metodo nao permitido.' }) };
  }

  const API_KEY = process.env.UMBRELLAPAG_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'UMBRELLAPAG_API_KEY nao configurada no ambiente.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalido no corpo da requisicao.' }) };
  }

  const { nome, email, cpf, celular, valor, produtoNome, postbackUrl } = payload;

  if (!nome || !email || !cpf || !valor) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Dados obrigatorios faltando (nome, email, cpf, valor).' }) };
  }

  // valor esperado em reais (ex: 497.00) -> converte para centavos (inteiro)
  const amountCents = Math.round(Number(valor) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valor invalido.' }) };
  }

  const cpfLimpo = String(cpf).replace(/\D/g, '');
  const docType = cpfLimpo.length > 11 ? 'CNPJ' : 'CPF';

  const body = {
    amount: amountCents,
    currency: 'BRL',
    paymentMethod: 'PIX',
    customer: {
      name: nome,
      email: email,
      document: {
        number: cpfLimpo,
        type: docType,
      },
      phone: celular ? String(celular).replace(/\D/g, '') : undefined,
    },
    items: [
      {
        title: produtoNome || 'Mentoria Metodo PHDNOSEUA',
        unitPrice: amountCents,
        quantity: 1,
        tangible: false,
      },
    ],
    pix: {
      expiresInDays: 1,
    },
    postbackUrl: postbackUrl || undefined,
    traceable: true,
  };

  try {
    const resp = await fetch(`${API_BASE}/user/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'User-Agent': 'UMBRELLAB2B/1.0',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data.message || 'Erro ao criar transacao Pix.', details: data }),
      };
    }

    // Devolve ao front-end so o necessario para renderizar o QR/copia-e-cola e permitir consulta de status
    return {
      statusCode: 200,
      body: JSON.stringify({
        id: data.data?.id,
        status: data.data?.status,
        qrCode: data.data?.qrCode,
        amount: data.data?.amount,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Falha ao comunicar com o gateway.', details: String(err) }),
    };
  }
};
