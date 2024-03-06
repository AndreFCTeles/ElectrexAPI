/* |----- INICIALIZAÇÃO DO SERVIDOR -----| */

// importação de frameworks
require('dotenv').config(); // ---------------------------------------- Variáveis de ambiente
const express = require('express'); // -------------------------------- Framework essencial para API
const { body, validationResult } = require('express-validator'); // --- 
const cors = require('cors'); // -------------------------------------- Framework de busca de dados
const { MongoClient } = require('mongodb'); // ------------------------ MongoDB driver
const fs = require('fs');
const path = require('path');

// configuração do servidor
const app = express();
const port = process.env.PORT || 3000;

// URI para conectar a MongoDB
const uri = process.env.MONGODB_URI;

// Cliente MongoDB
const client = new MongoClient(uri);
let db;

// Inicialização de middleware
app.use(express.json());  // ----------------------------------------- Funcionalidades básicas Express para funcionalidades do servidor
//app.use(express.urlencoded({ extended: true })); // ---------------- Permite decompor URLs para melhor POST de dados de formulários
app.use(cors()); // -------------------------------------------------- CORS básico para cross-referencing de origens cliente-servidor
app.use(express.static('../JRMFerias/build'));
app.get('*', (req, res) => { res.sendFile(path.resolve(__dirname, '../JRMFerias', 'build', 'index.html')); });



/* |----- FUNÇÕES PARA FUNCIONALIDADES DO SERVIDOR - Funções "Helper" -----| */

// Tratamento de erros
const handleError = (res, error, message = 'Erro') => {
   console.error(`${message}: ${error.message}`);
   res.status(500).json({ error: message });
};

// Conectar ao MongoDB
async function connectToMongoDB() {
   try {
      await client.connect();
      db = client.db();
      console.log("Conectado à base de dados (MongoDB)");
   } catch (error) {
      console.error("Não foi possível conectar à base de dados (MongoDB):", error);
      process.exit(1);
   }
}
connectToMongoDB();





// |----------------------------|
// |----- ENDPOINTS DA API -----|
// |----------------------------|


// |----- ENDPOINTS DE BUSCA -----|

// API endpoint para buscar dados (pre-paginados, pre-ordenados) - reparações
app.get('/api/getpagdata', async (req, res) => {
   const { dataType, sortField = "DateTime", sortOrder = 'desc', page = 1, pageSize = 30, ...filters } = req.query;
   const numericPage = parseInt(page, 10);
   const numericPageSize = parseInt(pageSize, 10);

   try {
      const collection = db.collection(dataType);
      const queryFilters = Object.keys(filters).reduce((acc, curr) => {
         acc[curr] = { $regex: new RegExp(filters[curr], "i") }; // Case-insensitive match
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
   } catch (error) { handleError(res, error, 'Erro ao buscar dados paginados'); }
});

// API endpoint para buscar dados - reparações
app.get('/api/getdata', async (req, res) => {
   const { dataType, sortField = "DateTime", sortOrder = 'asc' } = req.query;

   try {
      const collection = db.collection(dataType);
      const data = await collection.find({})
         .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 })
         .toArray();

      res.json({ data });
   } catch (error) { handleError(res, error, 'Erro ao buscar dados'); }
});

// API endpoint para buscar data/hora
app.get('/api/currentDateTime', (req, res) => {
   try {
      const currentDateTime = new Date();
      res.json({ dateTime: currentDateTime.toISOString() });
   } catch (error) { handleError(res, error, 400, 'Erro ao buscar data/hora - Servidor'); }
});

//API endpoint para receber dados de colaboradores - férias
app.get('/api/getferias', (req, res) => {
   const filePath = path.join(__dirname, 'data_ferias/funcionarios.json');

   fs.readFile(filePath, (err, data) => {
      if (err) { return handleError(res, err, 'Erro ao ler dados'); }
      res.json(JSON.parse(data));
   });
});





// |----- ENDPOINTS DE ESCRITA -----|

// API endpoint para escrever dados - WIP
app.post('/api/novareparmaq',
   body('title').not().isEmpty().withMessage('Title is required'),
   body('description').optional().isLength({ min: 5 }),
   async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) { return res.status(400).json({ errors: errors.array() }); }

      const newRepar = req.body;
      try {
         const collection = db.collection('repairs'); // Example collection name
         const result = await collection.insertOne(newRepar);
         if (result.acknowledged) { res.status(201).json({ success: true, data: newRepar }); }
         else { throw new Error('Falha ao inserir documento'); }
      } catch (error) { handleError(res, error, 'Erro ao escrever dados'); }
   });

// API endpoint para escrever dados de colaboradores - Férias
app.post('/api/novocolaborador', (req, res) => {
   const filePath = path.join(__dirname, '/data_ferias/funcionarios.json');
   const newWorker = req.body;

   fs.readFile(filePath, (err, data) => {
      if (err) { return handleError(res, err, 'Busca de dados falhou - Servidor'); }

      const content = JSON.parse(data);
      content.workers.push(newWorker);

      fs.writeFile(filePath, JSON.stringify(content, null, 2), (err) => {
         if (err) { return handleError(res, err, 'Erro ao escrever dados'); }
         res.status(201).json({ message: 'Dados inseridos com sucesso', newWorker });
      });
   });
});

// API endpoint para escrever dados - WIP

// API endpoint para login - WIP






/* |----- CORRER SERVIDOR -----| */

app.listen(port, '192.168.0.12', () => { console.log(`Servidor a correr em http://192.168.0.12:${port}`); });
