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

  const { nome, email, cpf, celular, valor, itens, postbackUrl } = payload;

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

  // A UmbrellaPag lista "ip" como campo obrigatorio do corpo da requisicao.
  const clientIp =
    (event.headers['x-nf-client-connection-ip']) ||
    (event.headers['x-forwarded-for'] && event.headers['x-forwarded-for'].split(',')[0].trim()) ||
    '127.0.0.1';

  // items[] estruturado: um item por produto (principal + order bump, se houver),
  // em vez de concatenar tudo num titulo unico. O somatorio de unitPrice*quantity
  // deve bater com o amount total enviado.
  const itemsArray = Array.isArray(itens) && itens.length > 0
    ? itens.map((it) => ({
        title: it.nome || 'Item',
        unitPrice: Math.round(Number(it.valor) * 100),
        quantity: 1,
        tangible: false,
      }))
    : [{ title: 'Mentoria Metodo PHDNOSEUA', unitPrice: amountCents, quantity: 1, tangible: false }];

  const body = {
    amount: amountCents,
    currency: 'BRL',
    paymentMethod: 'PIX',
    ip: clientIp,
    customer: {
      name: nome,
      email: email,
      document: {
        number: cpfLimpo,
        type: docType,
      },
      phone: celular ? String(celular).replace(/\D/g, '') : undefined,
    },
    items: itemsArray,
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

    // Log resumido (evita truncar na interface de logs da Netlify)
    console.log('UmbrellaPag status HTTP:', resp.status);
    console.log('UmbrellaPag message:', data.message);
    console.log('UmbrellaPag data.status:', data.data?.status);
    console.log('UmbrellaPag refusedReason:', data.data?.refusedReason);
    console.log('UmbrellaPag error:', data.error);

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({
          error: data.message || data.error || 'Erro ao criar transacao Pix.',
          details: data,
        }),
      };
    }

    // A UmbrellaPag pode responder com HTTP 200 mas status "REFUSED" dentro do corpo,
    // com o motivo detalhado em refusedReason.
    if (data.data?.status === 'REFUSED') {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: 'Transacao recusada pelo gateway: ' + (data.data.refusedReason || 'motivo nao informado.'),
          details: data,
        }),
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
