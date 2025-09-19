module.exports = (dbBancaData) => {
   const express = require('express');
   const router = express.Router();
   const handleError = require('../utils/handleError');



   // Middleware para assegurar conexão à DB
   router.use(async (req, res, next) => { next(); });

   // |----- ENDPOINTS DE BUSCA -----|

   // API endpoint para buscar dados (pre-paginados, pre-ordenados) - Reparações
   router.get('/getpagdata', async (req, res) => {
      const { dataType, sortField = "DateTime", sortOrder = 'desc', page = 1, pageSize = 30, ...filters } = req.query;
      const numericPage = parseInt(page, 10);
      const numericPageSize = parseInt(pageSize, 10);
      try {
         const collection = dbRepairData.collection(dataType);
         const queryFilters = Object.keys(filters).reduce((acc, curr) => {
            acc[curr] = { $regex: new RegExp(filters[curr], "i") };
            return acc;
         }, {});

         const totalItems = await collection.countDocuments(queryFilters);
         const data = await collection.find(queryFilters)
            .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 })
            .skip((numericPage - 1) * numericPageSize)
            .limit(numericPageSize)
            .toArray();
         const totalPages = Math.ceil(totalItems / numericPageSize);

         res.json({
            data,
            totalItems,
            totalPages,
            currentPage: numericPage
         });
      } catch (error) { handleError(res, error, 'Erro ao buscar dados paginados - Servidor'); }
   });
   // API endpoint para buscar dados - Reparações
   router.get('/getdata', async (req, res) => { // router.get('/api/getRepairData', async (req, res) => {
      const { dataType, sortField = "DateTime", sortOrder = 'asc' } = req.query;
      try {
         const collection = dbRepairData.collection(dataType);
         const data = await collection.find({})
            .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 })
            .toArray();
         res.json({ data });
      } catch (error) { handleError(res, error, 'Erro ao buscar dados - Servidor'); }
   });

   return router;
}