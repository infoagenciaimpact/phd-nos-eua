// netlify/functions/check-status.js
//
// Consulta o status de uma transacao Pix ja criada, pelo id.
// Usada pelo checkout para saber quando o pagamento foi confirmado.

const API_BASE = 'https://api-gateway.umbrellapag.com/api';

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metodo nao permitido.' }) };
  }

  const API_KEY = process.env.UMBRELLAPAG_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'UMBRELLAPAG_API_KEY nao configurada no ambiente.' }) };
  }

  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Parametro id obrigatorio.' }) };
  }

  try {
    const resp = await fetch(`${API_BASE}/user/transactions/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'User-Agent': 'UMBRELLAB2B/1.0',
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data.message || 'Erro ao consultar transacao.', details: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: data.data?.id,
        status: data.data?.status,
        paidAt: data.data?.paidAt,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Falha ao comunicar com o gateway.', details: String(err) }),
    };
  }
};
