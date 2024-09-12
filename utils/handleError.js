function handleError(res, error, message = 'Erro') {
   console.error(`${message}: ${error.message}`);
   res.status(500).json({ error: message });
}

module.exports = handleError;