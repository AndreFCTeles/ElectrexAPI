const dayjs = require('dayjs');

// Util para formato data/hora
function getCurrentDateTime() { return dayjs().format('HH:mm:ss, DD/MM/YYYY'); }

module.exports = getCurrentDateTime;