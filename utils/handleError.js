const dayjs = require('dayjs');

function handleError(res, err, errMsg = 'Erro', fallbackStatus = 500) {
   if (!err) {
      const status = inferStatusFromMessage(errMsg) || 400;
      return res.status(status).json({ error: errMsg });
   }

   // Prefere códigos de estado (http-errors)
   const status = err.statusCode || err.status || fallbackStatus;

   // Detalhes para diagnóstico
   console.error(`[${dayjs().format('HH:mm:ss, DD-MM-YYYY')}]`, err.stack || err);

   // Esconde internals em prod
   const body = { error: errMsg };
   if (process.env.NODE_ENV !== 'production') {
      body.details = err.message;
      if (err.code) body.code = err.code;
   }

   // Validações de database
   if (err.name === 'ValidationError') body.validation = err.errors;
   if (err.code === 11000) { // MongoDB duplicate key
      body.error = 'Duplicado';

      if (!err.status && !err.statusCode && status === fallbackStatus) {
         return res.status(409).json(body);
      }
   }

   return res.status(status).json(body);
}

module.exports = handleError;


function inferStatusFromMessage(msg = '') {
   const m = msg.toLowerCase();

   // 404s
   if (m.includes('não encontrado') || m.includes('nao encontrado') || m.includes('evento não encontrado')) {
      return 404;
   }
   // 409s (duplicates)
   if (m.includes('duplicado') || m.includes('chave duplicada') || m.includes('já existe')) {
      return 409;
   }
   // 400s (bad input)
   if (
      m.includes('obrigatório') || m.includes('obrigatorio') ||
      m.includes('inválid') || m.includes('invalid') ||
      m.includes('dados de ausência inválidos') || m.includes('tipo inválido')
   ) { return 400; }
   // Generic server action failure
   if (m.startsWith('falha ao ')) return 500;
   // Default
   return 400;
}


// old
/*
function handleError(res, error, message = 'Erro') {
   console.error(`${message}: ${error.message}`);
   res.status(500).json({ error: message });
}
*/
