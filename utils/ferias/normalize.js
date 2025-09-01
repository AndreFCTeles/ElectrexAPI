/* |----- Normalização de departamentos (previne duplicados) -----| */
function norm(input) {
   if (typeof input !== 'string') return '';
   let s = input.normalize('NFKD'); // normalização Unicode (split base + acentuação) - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
   s = s.toLowerCase()
      .replace(/[\p{M}]/gu, '') // Remove símbolos especiais
      .replace(/\s+/g, ' ') // Remove todo o whitespace
      .replace(/[^a-z0-9]/g, ''); // Remove pontuação/tudo o que não seja a-z ou 0-9
   return s;
};

module.exports = norm;