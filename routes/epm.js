
module.exports = (dbProdutosElectrex) => {
   const express = require('express');
   const router = express.Router();
   const handleError = require('../utils/handleError');

   router.use(async (req, res, next) => {
      next();
   });
   //console.log("epm.js router initialized with db:", dbProdutosElectrex.databaseName);

   // Endpoint to get main categories with their subcategories
   router.get('/getcategories', async (req, res) => {
      try {
         // Assuming 'ProdutosElectrex' is already connected to the MongoDB collection
         const collection = dbProdutosElectrex.collection('CategoriasProd'); // Use your MongoDB collection name

         // Fetch all categories and subcategories
         const categories = await collection.find({}).toArray();

         // Respond with the categories
         res.status(200).json({ categories });
      } catch (error) {
         console.error("Failed to fetch categories:", error);
         res.status(500).json({ error: 'Failed to fetch categories' });
      }
   });

   // Endpoint to get subcategories based on a selected category
   router.get('/getsubcategories', async (req, res) => {
      const { mainCategory } = req.query;

      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const category = await collection.findOne({ value: mainCategory });

         if (category && category.subCategories) {
            res.status(200).json({ subCategories: category.subCategories });
         } else {
            res.status(404).json({ error: 'Subcategories not found' });
         }
      } catch (error) {
         console.error("Failed to fetch subcategories:", error);
         res.status(500).json({ error: 'Failed to fetch subcategories' });
      }
   });


   router.get('/gettechfields', async (req, res) => {
      try {
         // Assuming 'ProdutosElectrex' is already connected to the MongoDB collection
         const collection = dbProdutosElectrex.collection('Produtos'); // Use your MongoDB collection name

         // Fetch all categories and subcategories
         const categories = await collection.find({}).toArray();

         // Respond with the categories
         res.status(200).json({ categories });
      } catch (error) {
         console.error("Failed to fetch categories:", error);
         res.status(500).json({ error: 'Failed to fetch categories' });
      }
   });

   return router;
};