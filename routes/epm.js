module.exports = (dbProdutosElectrex) => {
   const express = require('express');
   const router = express.Router();
   const { ObjectId } = require('mongodb');
   const { uploadFileToFTP } = require('../utils/ftpUploader');
   const handleError = require('../utils/handleError');

   router.use(async (req, res, next) => { next(); });
   //console.log("epm.js router inicializado com db:", dbProdutosElectrex.databaseName);





   // |----- ENDPOINTS DE BUSCA -----|

   // Endpoint para buscar produtos
   router.get('/getproducts', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const products = await collection.find({}).toArray();
         res.status(200).json({ products });
      } catch (error) {
         console.error("Erro ao buscar dados de produtos:", error);
         res.status(500).json({ error: 'Erro ao buscar dados de produtos' });
      }
   });

   // Endpoint para buscar categorias
   router.get('/getcategories', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const categories = await collection.find({}).toArray();
         res.status(200).json({ categories });
      } catch (error) {
         console.error("Erro ao buscar categorias:", error);
         res.status(500).json({ error: 'Erro ao buscar categorias' });
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
         console.error("Erro ao buscar subcategorias:", error);
         res.status(500).json({ error: 'Erro ao buscar subcategorias' });
      }
   });

   // Endpoint para buscar dados técnicos
   router.get('/getUniqueTechnicalFields', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const products = await collection.find({}).toArray();
         const technicalFields = [...new Set( //Extrair dados técnicos
            products.flatMap(product => product.technical.map(field => field.field))
         )];
         res.status(200).json({ technicalFields });
      } catch (error) {
         console.error("Erro ao buscar dados técnicos:", error);
         res.status(500).json({ error: 'Erro ao buscar dados técnicos' });
      }
   });

   // Endpoint para buscar funções/funcionalidades
   router.get('/getProductFunctions', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('FuncionalidadesProd');
         const functions = await collection.find({}).toArray();
         res.status(200).json({ functions });
      } catch (error) {
         console.error("Erro ao buscar funções:", error);
         res.status(500).json({ error: 'Erro ao buscar funções' });
      }
   });



   // |----- ENDPOINTS DE ESCRITA -----|

   // Adicionar nova categoria
   router.post('/addCategory', async (req, res) => {
      const { parentValue, label } = req.body;  // parentValue = parent category value
      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const newValue = parentValue ? `${parentValue}-${label.substring(0, 3).toLowerCase()}` : label.substring(0, 3).toLowerCase();
         if (parentValue) { // Subcategoria            
            await collection.updateOne(
               { "value": parentValue },
               {
                  $push: {
                     "subCategories": {
                        label,
                        value: newValue,
                        technical: [],
                        subCategories: [],
                        format: []
                     }
                  }
               }
            );
         } else { // Categoria            
            await collection.insertOne({
               label,
               value: newValue,
               technical: [],
               subCategories: [],
               format: []
            });
         }
         res.status(201).json({ message: 'Categoria adicionada com sucesso' });
      } catch (error) {
         console.error("Erro ao adicionar categoria:", error);
         res.status(500).json({ error: 'Erro ao adicionar categoria' });
      }
   });

   // Adicionar dados de produto
   router.post('/addProduct', async (req, res) => {
      //const productData = req.body;
      const productData = req.body;
      const { images } = productData; // desconstruir images do objeto de dados

      try {
         const collection = dbProdutosElectrex.collection('Produtos');

         for (const image of images) {
            const remoteImagePath = `/path/to/nas/images/${image.imageName}`;
            const remoteThumbnailPath = `/path/to/nas/thumbnails/${image.thumbnailName}`;

            // FTP Upload (awaiting success before proceeding)
            await uploadFileToFTP(image.imagePath, remoteImagePath);
            await uploadFileToFTP(image.thumbnailPath, remoteThumbnailPath);

            // Update paths in the productData to reflect NAS locations
            image.imagePath = remoteImagePath;
            image.thumbnailPath = remoteThumbnailPath;
         }

         const result = await collection.insertOne(productData);
         res.status(201).json({ message: 'Produto adicionado com sucesso ', id: result.insertedId });
      } catch (error) {
         console.error('Erro ao adicionar produto:', error);
         res.status(500).json({ error: 'Erro ao adicionar produto' });
      }
   });



   // |----- ENDPOINTS DE ATUALIZAÇÃO -----|

   // Editar categoria
   router.patch('/editCategory', async (req, res) => {
      const { categoryValue, newLabel } = req.body;
      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const newValue = newLabel.substring(0, 3).toLowerCase();  // Gerar novo 'value' através de 'label'
         const result = await collection.updateOne(
            { "value": categoryValue },
            { $set: { "label": newLabel, "value": newValue } }
         );
         if (result.matchedCount > 0) {
            return res.status(200).json({ message: 'Categoria editada com sucesso' });
         }

         // Se não existir categoria, procurar subcategorias correspondentes
         const updateSubcategory = await collection.updateOne(
            { "subCategories.value": categoryValue },
            { $set: { "subCategories.$[elem].label": newLabel, "subCategories.$[elem].value": newValue } },
            { arrayFilters: [{ "elem.value": categoryValue }] } // Certificar que apenas subcategoria correspondente é atualizada
         );
         if (updateSubcategory.matchedCount > 0) {
            return res.status(200).json({ message: 'Subcategoria editada com sucesso' });
         }

         res.status(404).json({ message: 'Categoria não encontrada' });
      } catch (error) {
         console.error("Erro ao editar categoria:", error);
         res.status(500).json({ error: 'Erro ao editar categoria' });
      }
   });

   // Editar dados de produto
   router.patch('/updateProduct/:id', async (req, res) => {
      const productId = req.params.id; // Should be a string
      const updatedProductData = req.body;

      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const result = await collection.updateOne(
            { _id: ObjectId(productId) },
            { $set: updatedProductData }
         );

         if (result.matchedCount > 0) {
            res.status(200).json({ message: 'Produto atualizado com sucesso' });
         } else {
            res.status(404).json({ error: 'Produto não encontrado' });
         }
      } catch (error) {
         console.error('Erro ao editar produto:', error);
         res.status(500).json({ error: 'Erro ao editar produto' });
      }
   });



   // |----- ENDPOINTS DE REMOÇÃO -----|

   // Eliminar categoria
   router.delete('/deleteCategory/:categoryValue', async (req, res) => {
      const { categoryValue } = req.params;
      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         // Verifica se é categoria e remove se encontrada
         const deleteRoot = await collection.deleteOne({ value: categoryValue });
         if (deleteRoot.deletedCount > 0) {
            return res.status(200).json({ message: 'Categoria eliminada com sucesso' });
         }
         // Verifica se é subcategoria e remove se encontrada
         const removeSub = await collection.updateMany(
            {},
            { $pull: { subCategories: { value: categoryValue } } }
         );
         if (removeSub.modifiedCount > 0) {
            res.status(200).json({ message: 'Subcategoria eliminada com sucesso' });
         } else {
            res.status(404).json({ message: 'Subcategoria não encontrada' });
         }
         res.status(200).json({ message: 'Categoria eliminada com sucesso' });
      } catch (error) {
         console.error("Erro ao eliminar categoria:", error);
         res.status(500).json({ error: 'Erro ao eliminar categoria' });
      }
   });

   return router;
};