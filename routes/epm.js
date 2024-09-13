module.exports = (dbProdutosElectrex) => {
   const express = require('express');
   const router = express.Router();
   const handleError = require('../utils/handleError');

   router.use(async (req, res, next) => { next(); });
   //console.log("epm.js router inicializado com db:", dbProdutosElectrex.databaseName);

   // Endpoint para buscar categorias
   router.get('/getcategories', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const categories = await collection.find({}).toArray();
         res.status(200).json({ categories });
      } catch (error) {
         console.error("Falha ao buscar categorias:", error);
         res.status(500).json({ error: 'Falha ao buscar categorias' });
      }
   });

   // Endpoint para buscar subcategorias baseado na categoria selecionada
   router.get('/getsubcategories', async (req, res) => {
      const { mainCategory } = req.query;

      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const category = await collection.findOne({ value: mainCategory });

         if (category && category.subCategories) {
            res.status(200).json({ subCategories: category.subCategories });
         } else {
            res.status(404).json({ error: 'Subcategoria(s) não encontrada(s)' });
         }
      } catch (error) {
         console.error("Falha ao buscar subcategorias:", error);
         res.status(500).json({ error: 'Falha ao buscar subcategorias' });
      }
   });


   router.get('/gettechfields', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const categories = await collection.find({}).toArray();
         res.status(200).json({ categories });
      } catch (error) {
         console.error("Falha ao buscar dados técnicos:", error);
         res.status(500).json({ error: 'Falha ao buscar dados técnicos' });
      }
   });

   return router;
};