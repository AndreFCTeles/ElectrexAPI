module.exports = (dbProdutosElectrex, dayjs, mongooseConnection) => {
   const express = require('express');
   const router = express.Router();
   const { ObjectId } = require('mongodb');
   const Category = require('./../schemas/Category')(mongooseConnection);

   router.use(async (req, res, next) => { next(); });



   // Helpers/utils para categorias
   const normalizeString = (str) => {
      return str
         .trim()
         .normalize("NFD") // Normalização de acentos
         .replace(/[\u0300-\u036f]/g, "") // Remoção de sinais diacríticos (cedilhas, etc)
         .replace(/[^a-zA-Z0-9]/g, "") // Remoção de caracteres especiais e pontuação
         .replace(/\s+/g, '_') // Substituição de espaços por underscores 
         .toLowerCase()
         .substring(0, 3);
   };

   async function generateUniqueValue(Category, label, parentValue) {
      const normLabel = normalizeString(label);
      const baseValue = parentValue ? `${parentValue}-${normLabel}` : normLabel;
      let uniqueValue = baseValue;
      let counter = 1;
      const rootValue = parentValue ? parentValue.split('-')[0] : null;
      // Localizar raíz e parent category
      if (rootValue) {
         const { currentCategory } = await locateTargetParent(rootValue, parentValue);

         if (currentCategory) {
            const existingValues = currentCategory.subCategories ? new Set(
               currentCategory.subCategories.map((sub) => sub.value)
            ) : null;

            if (existingValues) {
               while (existingValues.has(uniqueValue)) {
                  uniqueValue = `${baseValue}_${counter}`;
                  counter++;
               }
            }
         }
      } else {
         // Para categorias ao nível da raiz
         while (await Category.findOne({ value: uniqueValue })) {
            uniqueValue = `${baseValue}_${counter}`;
            counter++;
         }
      }

      return uniqueValue;
   }

   async function locateTargetParent(rootValue, parentValue) {
      const segments = parentValue.split('-');
      const rootCategory = await Category.findOne({ value: rootValue });

      if (!rootCategory) {
         console.error('Root category not found.');
         throw new Error('Root category not found.');
      }

      console.log(`Root category fetched: ${JSON.stringify(rootCategory, null, 2)}`);

      let currentCategory = rootCategory;
      for (let i = 1; i < segments.length; i++) {
         const nextSegment = segments.slice(0, i + 1).join('-');
         console.log(`Searching for segment: ${nextSegment} at level: ${i}`);
         currentCategory = currentCategory.subCategories.find(sub =>
            sub.value === nextSegment &&
            sub.value.split('-').length === nextSegment.split('-').length
         );

         if (!currentCategory) {
            console.error(`Category not found for segment: ${nextSegment}`);
            throw new Error(`Category not found for segment: ${nextSegment}`);
         }

         console.log(`Found category at segment ${i}: ${JSON.stringify(currentCategory, null, 2)}`);
      }

      return { rootCategory, currentCategory };
   }




   // |----- ENDPOINTS DE BUSCA -----|

   // Endpoint de credenciais
   router.get('/getlogin', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('Credenciais');
         const credentials = await collection.find({}).toArray();
         res.status(200).json({ credentials });
      } catch (error) {
         console.error('Error fetching credentials:', error);
         res.status(500).json({ error: 'Error fetching credentials' });
      }
   });

   // Endpoint para buscar produtos
   router.get('/getProducts', async (req, res) => {
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
   router.get('/getCategories', async (req, res) => {
      // de momento não utilizada em favor de /getCategoriasMongoose para alinhamento com Schema
      try {
         const collection = dbProdutosElectrex.collection('CategoriasProd');
         const categories = await collection.find({}).toArray();
         res.status(200).json({ categories });
      } catch (error) {
         console.error("Erro ao buscar categorias:", error);
         res.status(500).json({ error: 'Erro ao buscar categorias' });
      }
   });
   router.get('/getCategoriesMongoose', async (req, res) => {
      try {
         const categories = await Category.find({}).lean(); // Using lean() for better performance
         res.status(200).json({ categories });
      } catch (error) {
         console.error('Erro ao buscar categorias com Mongoose:', error);
         res.status(500).json({ error: 'Erro ao buscar categorias com Mongoose' });
      }
   });

   // Endpoint para buscar subcategorias baseado na categoria selecionada
   router.get('/getSubcategories', async (req, res) => {
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
   router.get('/getTechnicalFields', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('DadosTecProd');
         const technicalFields = await collection.find({}).toArray();
         res.status(200).json({ technicalFields });
      } catch (error) {
         console.error("Erro ao buscar dados técnicos:", error);
         res.status(500).json({ error: 'Erro ao buscar dados técnicos' });
      }
   });
   router.get('/getUniqueTechnicalFields', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const products = await collection.find({}).toArray();
         const technicalFields = [...new Set( // Extrair dados técnicos
            products.flatMap(product => product.technical.map(field => field.field))
         )];
         res.status(200).json({ technicalFields });
      } catch (error) {
         console.error("Erro ao buscar dados técnicos:", error);
         res.status(500).json({ error: 'Erro ao buscar dados técnicos' });
      }
   });

   // Endpoint to get unique series values
   router.get('/getUniqueSeries', async (req, res) => {
      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const products = await collection.find({}).toArray();

         // Extract unique series values
         const uniqueSeries = [...new Set(
            products
               .filter(product => product.series) // Only consider products with a series field
               .map(product => product.series)
         )];

         // Map each series into the desired label:value format
         const seriesData = uniqueSeries.map(series => ({
            label: series,
            value: series.toLowerCase().replace(/\s/g, '').replace('série', 'serie')
         }));

         res.status(200).json({ seriesData });
      } catch (error) {
         console.error("Erro ao buscar séries:", error);
         res.status(500).json({ error: 'Erro ao buscar séries' });
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
      const { parentValue, categoryData } = req.body;
      console.log('Request Body for /addCategory:', req.body);

      try {
         const newCategoryData = {
            label: categoryData.label,
            value: await generateUniqueValue(Category, categoryData.label, parentValue),
            technical: categoryData.technical || [],
            subCategories: categoryData.subCategories || [],
            format: categoryData.format || [],
         };

         if (!parentValue) { // root-level
            //newCategoryData.value = await generateUniqueValue(Category, categoryData.label, null);
            const rootCategory = new Category(newCategoryData);
            await rootCategory.save();
            console.log('Root-level category successfully added:', JSON.stringify(rootCategory, null, 2));
            return res.status(201).json({ message: 'Category added successfully', category: rootCategory });
         }

         console.log(`Adding subcategory under parentValue: ${parentValue}`);
         const { rootCategory, currentCategory } = await locateTargetParent(parentValue.split('-')[0], parentValue);

         // Gerar um valor única para a nova categoria
         //newCategoryData.value = await generateUniqueValue(Category, categoryData.label, parentValue);

         currentCategory.subCategories.push(newCategoryData);
         console.log(`Updated parent after adding new subcategory: ${JSON.stringify(currentCategory, null, 2)}`);

         rootCategory.markModified('subCategories');
         await rootCategory.save();

         console.log('Subcategory successfully added:', JSON.stringify(newCategoryData, null, 2));
         res.status(201).json({ message: 'Category added successfully', category: newCategoryData });
      } catch (error) {
         console.error('Error adding category:', error);
         res.status(500).json({ error: error.message });
      }
   });
   // Adicionar nova categoria rápida - (label+value)
   router.post('/addQuickCategory', async (req, res) => {
      const { parentValue, label } = req.body;
      console.log('Request Body for /addQuickCategory:', req.body);

      try {
         const newCategoryData = {
            label: label,
            value: await generateUniqueValue(Category, label, parentValue),
            technical: [],
            subCategories: [],
            format: [],
         };
         if (!parentValue) { // root-level
            await newCategoryData.save();
            console.log('Root-level category successfully added:', JSON.stringify(newCategoryData, null, 2));
            return res.status(201).json({ message: 'Quick category added successfully', category: newCategoryData });
         }

         console.log(`Adding subcategory under parentValue: ${parentValue}`);
         const { rootCategory, currentCategory } = await locateTargetParent(parentValue.split('-')[0], parentValue);

         console.log(`Trying to push new subCategory: ${JSON.stringify(newCategoryData, null, 2)}`);

         await currentCategory.subCategories.push(newCategoryData);
         console.log(`Updated parent after adding new subcategory: ${JSON.stringify(currentCategory, null, 2)}`);

         rootCategory.markModified('subCategories');
         await rootCategory.save();

         console.log('Subcategory successfully added:', JSON.stringify(newCategoryData, null, 2));
         res.status(201).json({ message: 'Quick subcategory added successfully', category: newCategoryData });
      } catch (error) {
         console.error('Error adding quick category:', error);
         res.status(500).json({ error: error.message });
      }
   });


   // Adicionar dados técnicos
   router.post('/addTechnicalField', async (req, res) => {
      const { field, suf } = req.body;
      try {
         const collection = dbProdutosElectrex.collection('DadosTecProd');
         await collection.insertOne({ field, suf });
         res.status(201).json({ message: 'Campo técnico adicionado com sucesso' });
      } catch (error) {
         console.error('Erro ao adicionar campo técnico:', error);
         res.status(500).json({ error: 'Erro ao adicionar campo técnico' });
      }
   });

   // Adicionar dados de produto
   router.post('/addProduct', async (req, res) => {
      const productData = req.body;

      try {
         productData.createdDate = dayjs().toISOString();
         productData.updatedDate = dayjs().toISOString();

         const collection = dbProdutosElectrex.collection('Produtos');
         const result = await collection.insertOne(productData); // Inserir produto sem imagens

         res.status(201).json({
            message: 'Produto adicionado com sucesso',
            id: result.insertedId, // Retorna o novo ID do produto
         });
      } catch (error) {
         console.error('Erro ao adicionar produto:', error);
         res.status(500).json({ error: 'Erro ao adicionar produto' });
      }
   });



   // |----- ENDPOINTS DE ATUALIZAÇÃO -----|

   // Editar categoria
   router.patch('/editCategory', async (req, res) => {
      const { categoryValue, updates } = req.body;
      console.log('Request Body for /editCategory:', req.body);

      try {
         const rootValue = categoryValue.split('-')[0];
         const { rootCategory, currentCategory } = await locateTargetParent(rootValue, categoryValue);

         Object.assign(currentCategory, updates);
         console.log(`Updated category: ${JSON.stringify(currentCategory, null, 2)}`);

         if (updates.label) {
            const parentCategoryValue = categoryValue.split('-').slice(0, -1).join('-')
            currentCategory.value = await generateUniqueValue(Category, updates.label, parentCategoryValue);
         }

         rootCategory.markModified('subCategories');
         await rootCategory.save();

         console.log('Category successfully updated.');
         res.status(200).json({ message: 'Category updated successfully', category: currentCategory });
      } catch (error) {
         console.error('Error updating category:', error);
         res.status(500).json({ error: error.message });
      }
   });
   // Editar categoria rápida - (label+value)
   router.patch('/editQuickCategory', async (req, res) => {
      const { categoryValue, newLabel } = req.body;
      console.log('Request Body for /editQuickCategory:', req.body);

      try {
         const rootValue = categoryValue.split('-')[0];
         const { rootCategory, currentCategory } = await locateTargetParent(rootValue, categoryValue);
         const parentCategoryValue = categoryValue.split('-').slice(0, -1).join('-')

         currentCategory.label = newLabel;
         currentCategory.value = await generateUniqueValue(Category, newLabel, parentCategoryValue);

         console.log(`Updated category (quick): ${JSON.stringify(currentCategory, null, 2)}`);

         rootCategory.markModified('subCategories');
         await rootCategory.save();

         console.log('Category successfully updated (quick).');
         res.status(200).json({ message: 'Category updated successfully (quick)', category: currentCategory });
      } catch (error) {
         console.error('Error updating category (quick):', error);
         res.status(500).json({ error: error.message });
      }
   });

   // Editar dados técnicos
   router.patch('/updateTechnicalField', async (req, res) => {
      const { field, newSuf } = req.body;
      try {
         const collection = dbProdutosElectrex.collection('DadosTecProd');
         await collection.updateOne({ field }, { $set: { suf: newSuf } });
         res.status(200).json({ message: 'Campo técnico atualizado com sucesso' });
      } catch (error) {
         console.error('Erro ao atualizar campo técnico:', error);
         res.status(500).json({ error: 'Erro ao atualizar campo técnico' });
      }
   });


   // Editar dados de produto
   router.patch('/updateProduct/:id', async (req, res) => {
      const productId = req.params.id;
      const updatedProductData = req.body;
      delete updatedProductData._id;

      try {
         updatedProductData.updatedDate = dayjs().toISOString();

         const collection = dbProdutosElectrex.collection('Produtos');
         const result = await collection.updateOne(
            { _id: new ObjectId(productId) },
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
      //const { categoryValue } = req.body;
      const { categoryValue } = req.params;
      //console.log('Request Body for /deleteCategory:', req.body);
      console.log('Category value for /deleteCategory:', categoryValue);

      try {
         if (!categoryValue) { throw new Error('Category value is required.'); }
         const rootValue = categoryValue.split('-')[0];
         const parentCategoryValue = categoryValue.split('-').slice(0, -1).join('-');
         console.log(`Root value: ${rootValue}, Parent category value: ${parentCategoryValue}`);

         if (rootValue === categoryValue) {
            // Case 1: Root-level category deletion
            const deletedCategory = await Category.findOneAndDelete({ value: rootValue });
            if (!deletedCategory) { throw new Error('Category not found or already deleted.'); }
            console.log('Root-level category successfully deleted:', deletedCategory);
            return res.status(200).json({ message: 'Root-level category deleted successfully' });
         }

         // Case 2: Subcategory deletion
         const { rootCategory, currentCategory } = await locateTargetParent(rootValue, parentCategoryValue);
         const indexToRemove = currentCategory.subCategories.findIndex(sub => sub.value === categoryValue);
         if (indexToRemove === -1) { throw new Error('Subcategory not found.'); }

         const [deletedSubcategory] = currentCategory.subCategories.splice(indexToRemove, 1);
         console.log('Deleted subcategory:', deletedSubcategory);

         rootCategory.markModified('subCategories');
         await rootCategory.save();

         console.log('Subcategory successfully deleted.');
         res.status(200).json({ message: 'Subcategory deleted successfully', deletedSubcategory });
      } catch (error) {
         console.error('Error deleting category:', error);
         res.status(500).json({ error: error.message });
      }
   });

   // Eliminar dado técnico
   router.delete('/deleteTechnicalField/:field', async (req, res) => {
      const { field } = req.params;
      try {
         const collection = dbProdutosElectrex.collection('DadosTecProd');
         await collection.deleteOne({ field });

         res.status(200).json({ message: 'Campo técnico deletado com sucesso' });
      } catch (error) {
         console.error('Erro ao deletar campo técnico:', error);
         res.status(500).json({ error: 'Erro ao deletar campo técnico' });
      }
   });
   // Eliminar todas as referências a dado técnico
   router.delete('/nukeTechnicalField/:field', async (req, res) => {
      const { field } = req.params;
      try {
         const collection = dbProdutosElectrex.collection('DadosTecProd');
         const categoriesCollection = dbProdutosElectrex.collection('CategoriasProd');
         const productsCollection = dbProdutosElectrex.collection('Produtos');

         await collection.deleteOne({ field });

         await categoriesCollection.updateMany(
            {},
            { $pull: { technical: field } }
         );

         await productsCollection.updateMany(
            {},
            { $pull: { technical: { field } } }
         );

         res.status(200).json({ message: 'Campo técnico deletado com sucesso' });
      } catch (error) {
         console.error('Erro ao deletar campo técnico:', error);
         res.status(500).json({ error: 'Erro ao deletar campo técnico' });
      }
   });

   // Endpoint to delete a product
   router.delete('/deleteProduct/:id', async (req, res) => {
      const productId = req.params.id;

      try {
         const collection = dbProdutosElectrex.collection('Produtos');
         const result = await collection.deleteOne({ _id: new ObjectId(productId) });

         if (result.deletedCount > 0) {
            res.status(200).json({ message: 'Produto eliminado com sucesso' });
         } else {
            res.status(404).json({ error: 'Produto não encontrado' });
         }
      } catch (error) {
         console.error('Erro ao eliminar produto:', error);
         res.status(500).json({ error: 'Erro ao eliminar produto' });
      }
   });


   return router;
};