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
      // Localizar root e parent category
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
   /**
    * @openapi
    * /epm/getlogin:
    *   get:
    *     summary: Obter credenciais internas do EPM
    *     description: Devolve a coleção interna de credenciais usada pelo EPM (apenas para uso administrativo/testes).
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Credenciais obtidas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 credentials:
    *                   type: array
    *                   items: { type: object }
    *       500: { description: Erro ao obter credenciais }
    */
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
   /**
    * @openapi
    * /epm/getProducts:
    *   get:
    *     summary: Listar produtos
    *     description: Devolve a lista de produtos com os respetivos campos técnicos e relações (categoria/série/funções), conforme armazenado em MongoDB.
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Lista de produtos
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 products:
    *                   type: array
    *                   items: { $ref: '#/components/schemas/Product' }
    *       500: { description: Erro ao listar produtos }
    */
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
   /**
    * @openapi
    * /epm/getCategories:
    *   get:
    *     summary: Listar categorias (modo “array”)
    *     description: Lista de categorias a partir do armazenamento em array (modo legado).
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Categorias devolvidas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 categories:
    *                   type: array
    *                   items: { $ref: '#/components/schemas/Category' }
    *       500: { description: Erro ao listar categorias }
    */
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
   /**
    * @openapi
    * /epm/getCategoriesMongoose:
    *   get:
    *     summary: Listar categorias (modelo Mongoose)
    *     description: Obtém as categorias a partir do modelo Mongoose (estrutura recomendada).
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Categorias devolvidas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 categories:
    *                   type: array
    *                   items: { $ref: '#/components/schemas/Category' }
    *       500: { description: Erro ao listar categorias (Mongoose) }
    */
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
   /**
    * @openapi
    * /epm/getSubcategories:
    *   get:
    *     summary: Listar subcategorias de uma categoria
    *     description: Devolve subcategorias pertencentes à categoria principal fornecida.
    *     tags: [EPM]
    *     parameters:
    *       - in: query
    *         name: mainCategory
    *         required: true
    *         schema: { type: string }
    *         description: Nome/chave da categoria principal.
    *     responses:
    *       200:
    *         description: Subcategorias devolvidas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 subcategories:
    *                   type: array
    *                   items: { type: string }
    *       400: { description: Parâmetro mainCategory em falta }
    *       500: { description: Erro ao listar subcategorias }
    */
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
   /**
    * @openapi
    * /epm/getTechnicalFields:
    *   get:
    *     summary: Listar campos técnicos disponíveis
    *     description: Devolve todos os nomes de campos técnicos existentes para descrição de produtos.
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Campos técnicos
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 fields:
    *                   type: array
    *                   items: { type: string }
    *       500: { description: Erro ao listar campos técnicos }
    */
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
   /**
    * @openapi
    * /epm/getUniqueTechnicalFields:
    *   get:
    *     summary: Listar campos técnicos únicos
    *     description: Devolve a lista de campos técnicos únicos (sem duplicados).
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Lista única de campos técnicos
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 fields:
    *                   type: array
    *                   items: { type: string }
    *       500: { description: Erro ao agregar campos técnicos }
    */
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
   /**
    * @openapi
    * /epm/getUniqueSeries:
    *   get:
    *     summary: Listar séries únicas
    *     description: Devolve a lista de séries únicas existentes nos produtos.
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Séries únicas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 series:
    *                   type: array
    *                   items: { type: string }
    *       500: { description: Erro ao listar séries }
    */
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
   /**
    * @openapi
    * /epm/getProductFunctions:
    *   get:
    *     summary: Listar funções de produto
    *     description: Devolve a lista de funções/funcionalidades associadas aos produtos.
    *     tags: [EPM]
    *     responses:
    *       200:
    *         description: Funções devolvidas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 functions:
    *                   type: array
    *                   items: { type: string }
    *       500: { description: Erro ao listar funções }
    */
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
   /**
    * @openapi
    * /epm/addCategory:
    *   post:
    *     summary: Adicionar categoria
    *     description: Cria uma nova categoria. No modo Mongoose, insere no _collection_ dedicado; no modo “array”, acrescenta ao vetor existente.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CategoryInput'
    *     responses:
    *       201: { description: Categoria criada }
    *       400: { description: Dados inválidos ou em falta }
    *       409: { description: Categoria já existente }
    *       500: { description: Erro ao criar categoria }
    */
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
   /**
    * @openapi
    * /epm/addQuickCategory:
    *   post:
    *     summary: Adicionar categoria (via formulário rápido)
    *     description: Variante simplificada para criar categorias com os campos mínimos obrigatórios.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/QuickCategoryInput'
    *     responses:
    *       201: { description: Categoria criada }
    *       400: { description: Dados inválidos ou em falta }
    *       409: { description: Categoria já existente }
    *       500: { description: Erro ao criar categoria (rápida) }
    */
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
   /**
    * @openapi
    * /epm/addTechnicalField:
    *   post:
    *     summary: Adicionar campo técnico
    *     description: Insere um novo nome de campo técnico a ser usado na descrição de produtos.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [field]
    *             properties:
    *               field: { type: string, description: Nome do campo técnico }
    *     responses:
    *       201: { description: Campo técnico criado }
    *       400: { description: Dados inválidos ou em falta }
    *       409: { description: Campo técnico já existente }
    *       500: { description: Erro ao criar campo técnico }
    */
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
   /**
    * @openapi
    * /epm/addProduct:
    *   post:
    *     summary: Adicionar produto
    *     description: Cria um novo produto com atributos técnicos e metadados de categorização/série/funções.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/ProductInput'
    *     responses:
    *       201: { description: Produto criado }
    *       400: { description: Dados inválidos ou em falta }
    *       409: { description: Produto duplicado (conflito) }
    *       500: { description: Erro ao criar produto }
    */
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
   /**
    * @openapi
    * /epm/editCategory:
    *   patch:
    *     summary: Editar categoria
    *     description: Atualiza dados de uma categoria existente.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CategoryUpdateInput'
    *     responses:
    *       200: { description: Categoria atualizada }
    *       400: { description: Dados inválidos }
    *       404: { description: Categoria não encontrada }
    *       500: { description: Erro ao atualizar categoria }
    */
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
   /**
    * @openapi
    * /epm/editQuickCategory:
    *   patch:
    *     summary: Editar categoria (formulário rápido)
    *     description: Atualiza rapidamente os campos mínimos de uma categoria.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/QuickCategoryUpdateInput'
    *     responses:
    *       200: { description: Categoria atualizada }
    *       400: { description: Dados inválidos }
    *       404: { description: Categoria não encontrada }
    *       500: { description: Erro ao atualizar categoria (rápida) }
    */
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
   /**
    * @openapi
    * /epm/updateTechnicalField:
    *   patch:
    *     summary: Renomear/atualizar campo técnico
    *     description: Atualiza o nome ou metadados de um campo técnico existente.
    *     tags: [EPM]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [oldName, newName]
    *             properties:
    *               oldName: { type: string }
    *               newName: { type: string }
    *     responses:
    *       200: { description: Campo técnico atualizado }
    *       400: { description: Dados inválidos }
    *       404: { description: Campo técnico não encontrado }
    *       500: { description: Erro ao atualizar campo técnico }
    */
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
   /**
    * @openapi
    * /epm/updateProduct/{id}:
    *   patch:
    *     summary: Atualizar produto
    *     description: Atualiza os campos de um produto existente. Apenas os campos presentes no corpo serão alterados.
    *     tags: [EPM]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/ProductUpdateInput'
    *     responses:
    *       200: { description: Produto atualizado }
    *       400: { description: ID ou dados inválidos }
    *       404: { description: Produto não encontrado }
    *       500: { description: Erro ao atualizar produto }
    */
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
   /**
    * @openapi
    * /epm/deleteCategory/{categoryValue}:
    *   delete:
    *     summary: Eliminar categoria
    *     description: Remove a categoria indicada. Poderá falhar se existirem produtos associados.
    *     tags: [EPM]
    *     parameters:
    *       - in: path
    *         name: categoryValue
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200: { description: Categoria eliminada }
    *       404: { description: Categoria não encontrada }
    *       409: { description: Conflito (dependências existentes) }
    *       500: { description: Erro ao eliminar categoria }
    */
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
   /**
    * @openapi
    * /epm/deleteTechnicalField/{field}:
    *   delete:
    *     summary: Eliminar campo técnico
    *     description: Remove um campo técnico. Poderá falhar se houver produtos que o utilizem.
    *     tags: [EPM]
    *     parameters:
    *       - in: path
    *         name: field
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200: { description: Campo técnico eliminado }
    *       404: { description: Campo técnico não encontrado }
    *       409: { description: Conflito (dependências existentes) }
    *       500: { description: Erro ao eliminar campo técnico }
    */
   router.delete('/deleteTechnicalField/:field', async (req, res) => {
      const { field } = req.params;
      try {
         const collection = dbProdutosElectrex.collection('DadosTecProd');
         await collection.deleteOne({ field });

         res.status(200).json({ message: 'Campo técnico eliminado com sucesso' });
      } catch (error) {
         console.error('Erro ao eliminar campo técnico:', error);
         res.status(500).json({ error: 'Erro ao deletar campo técnico' });
      }
   });
   // Eliminar todas as referências a dado técnico
   /**
    * @openapi
    * /epm/nukeTechnicalField/{field}:
    *   delete:
    *     summary: Eliminar campo técnico (forçado)
    *     description: Remoção forçada de um campo técnico e respetivas referências. **Atenção:** operação destrutiva.
    *     tags: [EPM]
    *     parameters:
    *       - in: path
    *         name: field
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200: { description: Campo técnico eliminado (forçado) }
    *       404: { description: Campo técnico não encontrado }
    *       500: { description: Erro ao eliminar (forçado) campo técnico }
    */
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
         res.status(500).json({ error: 'Erro ao eliminar campo técnico' });
      }
   });

   // Endpoint to delete a product
   /**
    * @openapi
    * /epm/deleteProduct/{id}:
    *   delete:
    *     summary: Eliminar produto
    *     description: Remove definitivamente o produto indicado.
    *     tags: [EPM]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200: { description: Produto eliminado }
    *       400: { description: ID inválido }
    *       404: { description: Produto não encontrado }
    *       500: { description: Erro ao eliminar produto }
    */
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