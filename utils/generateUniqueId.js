function generateUniqueId(workers) {
   if (workers.length === 0) { return "1"; }
   const maxId = Math.max(...workers.map(worker => parseInt(worker.id, 10)));
   return (maxId + 1).toString();
}
module.exports = generateUniqueId;