/* |----- INICIALIZAÇÃO DO SERVIDOR -----| */

// importação de frameworks
require('dotenv').config(); // ----------------------------------------- Variáveis de ambiente
const express = require('express'); // --------------------------------- Framework essencial para API
const { body, validationResult } = require('express-validator'); // ---- Validação de dados
const cors = require('cors'); // --------------------------------------- Framework de busca de dados
const { MongoClient } = require('mongodb'); // ------------------------- MongoDB driver
const fs = require('fs'); // ------------------------------------------- Permite recurso a sistemas de ficheiros
const path = require('path'); // --------------------------------------- Permite estabelecer caminhos diretos para sistemas de ficheiros
const buildPath = path.join(__dirname, '..', 'JRMFerias', 'build'); //-- Caminhos para aplicação WEB JRMFérias
const dayjs = require('dayjs'); // ------------------------------------- Facilita gestão de datas

// configuração do servidor
const app = express();
const port = process.env.PORT || 3000;

// URI para conectar a MongoDB
const uri = process.env.MONGODB_URI;

// Cliente MongoDB
const client = new MongoClient(uri);
let db;

// Inicialização de middleware
app.use(express.json());  // ------------------------------------------ Funcionalidades básicas Express para funcionalidades do servidor
//app.use(express.urlencoded({ extended: true })); // ----------------- Permite decompor URLs para melhor POST de dados de formulários
app.use(cors()); // --------------------------------------------------- CORS básico para cross-referencing de origens cliente-servidor
app.use(express.static(buildPath));


/* |----- FUNÇÕES PARA FUNCIONALIDADES DO SERVIDOR - Funções "Helper" -----| */

// Tratamento de erros
const handleError = (res, error, message = 'Erro') => {
   console.error(`${message}: ${error.message}`);
   res.status(500).json({ error: message });
};

//geração de ID's
function generateUniqueId(workers) {
   if (workers.length === 0) { return "1"; }
   const maxId = Math.max(...workers.map(worker => parseInt(worker.id, 10)));
   return (maxId + 1).toString();
}

// Conectar ao MongoDB
async function connectToMongoDB() {
   try {
      await client.connect();
      db = client.db();
      console.log("Conectado à base de dados (MongoDB) - Servidor");
   } catch (error) {
      console.error("Não foi possível conectar à base de dados (MongoDB) - Servidor:", error);
      process.exit(1);
   }
}
connectToMongoDB();





// |----------------------------|
// |----- ENDPOINTS DA API -----|
// |----------------------------|


// |----- ENDPOINTS DE BUSCA -----|

// API endpoint generalista para buscar data/hora
app.get('/api/currentDateTime', (req, res) => {
   try {
      const currentDateTime = new Date();
      res.json({ dateTime: currentDateTime.toISOString() });
   } catch (error) { handleError(res, error, 400, 'Erro ao buscar data/hora - Servidor'); }
});

// API endpoint para buscar dados (pre-paginados, pre-ordenados) - Reparações
app.get('/api/getpagdata', async (req, res) => {
   const { dataType, sortField = "DateTime", sortOrder = 'desc', page = 1, pageSize = 30, ...filters } = req.query;
   const numericPage = parseInt(page, 10);
   const numericPageSize = parseInt(pageSize, 10);

   try {
      const collection = db.collection(dataType);
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
app.get('/api/getdata', async (req, res) => {
   const { dataType, sortField = "DateTime", sortOrder = 'asc' } = req.query;
   try {
      const collection = db.collection(dataType);
      const data = await collection.find({})
         .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1 })
         .toArray();
      res.json({ data });
   } catch (error) { handleError(res, error, 'Erro ao buscar dados - Servidor'); }
});

//API endpoint para receber dados de colaboradores e ausências - Férias
app.get('/api/getferias', (req, res) => {
   const filePath = path.join(__dirname, 'data_ferias/funcionarios.json');

   fs.readFile(filePath, (err, data) => {
      if (err) { return handleError(res, err, 'Erro ao ler dados - Servidor'); }
      res.json(JSON.parse(data));
   });
});

//API endpoint para receber dados de login - Férias
app.get('/api/getloginferias', (req, res) => {
   const filePath = path.join(__dirname, 'data_ferias/login.json');

   fs.readFile(filePath, (err, data) => {
      if (err) { return handleError(res, err, 'Erro ao ler dados - Servidor'); }
      res.json(JSON.parse(data));
   });
});





// |----- ENDPOINTS DE ESCRITA -----|

// API endpoint para escrita de dados - Reparações - WIP
app.post('/api/novareparmaq',
   body('title').not().isEmpty().withMessage('Obrigatório introduzir nome - Servidor'),
   body('description').optional().isLength({ min: 5 }),
   async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) { return res.status(400).json({ errors: errors.array() }); }
      const newRepar = req.body;
      try {
         const collection = db.collection('repairs');
         const result = await collection.insertOne(newRepar);
         if (result.acknowledged) { res.status(201).json({ success: true, data: newRepar }); }
         else { throw new Error('Falha ao inserir documento - Servidor'); }
      } catch (error) { handleError(res, error, 'Erro ao escrever dados - Servidor'); }
   });

// API endpoint para escrita de dados de ausência - Férias
app.post('/api/postferias', (req, res) => {
   const { id, absence, type } = req.body;
   console.log("Request received for /api/postferias", req.body);
   if (!id || !absence || !type) { return res.status(400).json({ message: 'Campos obrigatórios em falta - Servidor' }); }
   if (!absence.start || !absence.end) { return res.status(400).json({ message: 'Dados de ausência inválidos - Servidor' }) }

   const filePath = path.join(__dirname, '/data_ferias/funcionarios.json');
   fs.readFile(filePath, (err, data) => {
      if (err) {
         console.error('Falha ao ler ficheiro - Servidor:', err);
         return res.status(500).json({ message: 'Falha ao ler dados - Servidor' });
      }

      let content;
      try { content = JSON.parse(data); }
      catch (parseErr) {
         console.error('Parse de ficheiro JSON falhou - Servidor:', parseErr);
         return res.status(500).json({ message: 'Parse de dados falhou - Servidor' });
      }

      const worker = content.workers.find(worker => worker.id === id);
      if (!worker) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }

      if (type === 'vacation') {
         worker.avaDays -= absence.busDays || 0;
         worker.vacations.push(absence);
      }
      else if (type === 'off-day') {
         if (absence.allDay) { worker.avaDays -= 1; }
         else { worker.compH = (worker.compH || 0) + (absence.absTime || 0); }
         worker.offDays.push(absence);
      }
      else { return res.status(400).json({ message: 'Tipo inválido - Servidor' }); }

      fs.writeFile(filePath, JSON.stringify(content, null, 2), (writeErr) => {
         if (writeErr) {
            console.error('Falha ao escrever ficheiro - Servidor:', writeErr);
            return res.status(500).json({ message: 'Falha ao escrever dados - Servidor' });
         }
         res.json({ message: 'Ausência adicionada com sucesso - Servidor' });
      });
   });
});

// API endpoint para atualizar/editar dados de ausência - Férias
app.patch('/api/editferias/:eventId', async (req, res) => {
   const { eventId } = req.params;
   const updates = req.body;
   console.log(`Received eventId: ${eventId}`);
   console.log('updates:', updates);
   console.log('Received updates:', JSON.stringify(updates, null, 2));

   const [workerId, absenceTypeCode] = eventId.split("-");
   console.log(`Parsed workerId: ${workerId}, absenceTypeCode: ${absenceTypeCode}`);

   const filePath = path.join(__dirname, 'data_ferias/funcionarios.json');
   try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      let { workers } = JSON.parse(data);
      const worker = workers.find(w => w.id === workerId);
      if (!worker) return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' });

      const currentEventType = absenceTypeCode === '1' ? 'vacations' : 'offDays';
      const newEventType = updates.type === 'vacation' ? 'vacations' : 'offDays';
      const eventList = worker[currentEventType];

      const eventIndex = eventList.findIndex(e => e.id === eventId);
      if (eventIndex === -1) return res.status(404).json({ message: 'Evento não encontrado - Servidor' });

      const oldEvent = eventList[eventIndex];

      console.log('Old Event:', oldEvent);
      console.log('Old Event:', JSON.stringify(oldEvent, null, 2));

      // Adjust worker's avaDays or compH based on the old event being removed
      if (currentEventType === 'vacations') {
         worker.avaDays += oldEvent.busDays || 0;
      } else if (currentEventType === 'offDays') {
         if (oldEvent.allDay) { worker.avaDays += 1; }
         else { worker.compH = (worker.compH || 0) - (oldEvent.absTime || 0); }
      }

      let updatedEvent;

      if (newEventType === 'vacations') {
         updatedEvent = {
            id: updates.id,
            start: updates.start,
            end: updates.end,
            busDays: updates.busDays
         };
         worker.avaDays -= updates.busDays || 0;
      } else if (newEventType === 'offDays' && updates.allDay) {
         updatedEvent = {
            id: updates.id,
            start: updates.start,
            end: updates.end,
            allDay: updates.allDay,
            busDays: 1
         };
         worker.avaDays -= 1;
      } else {
         updatedEvent = {
            id: updates.id,
            start: updates.start,
            end: updates.end,
            allDay: updates.allDay,
            absTime: updates.allDay ? 0 : updates.absTime,
            lunch: updates.lunch
         };
         worker.compH = (worker.compH || 0) + (updates.absTime || 0);
      }
      console.log("constructed event data:", updatedEvent);
      console.log('constructed event data:', JSON.stringify(updatedEvent, null, 2));


      // Move the event if the type has changed
      if (currentEventType !== newEventType) {
         worker[currentEventType].splice(eventIndex, 1);
         worker[newEventType].push(updatedEvent);
      } else {
         // Update the specific event in the array
         worker[currentEventType].splice(eventIndex, 1, updatedEvent);
      }

      console.log('Updated worker:', JSON.stringify(worker, null, 2));

      await fs.promises.writeFile(filePath, JSON.stringify({ workers }, null, 2));

      res.json({ message: 'Evento atualizado com sucesso', event: eventList[eventIndex] });
   } catch (error) {
      console.error('Erro ao atualizar dados de evento - Servidor:', error);
      res.status(500).json({ message: 'Erro ao atualizar dados de evento - Servidor' });
   }
});

// API endpoint para eliminar dados de ausência - Férias
app.delete('/api/deleteferias/:eventId', async (req, res) => {
   const { eventId } = req.params;
   const [workerId, absenceTypeCode, eventUniqueId] = eventId.split("-");

   const filePath = path.join(__dirname, 'data_ferias/funcionarios.json');
   try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      let { workers } = JSON.parse(data);
      const worker = workers.find(w => w.id === workerId);
      if (!worker) return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' });

      const eventType = absenceTypeCode === '1' ? 'vacations' : 'offDays';
      const eventList = worker[eventType];
      const eventIndex = eventList.findIndex(e => e.id === eventId);
      if (eventIndex === -1) return res.status(404).json({ message: 'Evento não encontrado - Servidor' });

      // Remover evento
      eventList.splice(eventIndex, 1);
      await fs.promises.writeFile(filePath, JSON.stringify({ workers }, null, 2));

      res.json({ message: 'Evento eliminado com sucesso' });
   } catch (error) {
      console.error('Erro ao eliminar evento - Servidor:', error);
      res.status(500).json({ message: 'Erro ao eliminar evento - Servidor' });
   }
});

// API endpoint para escrita de dados de colaboradores - Férias
app.post('/api/novocolab', (req, res) => {
   const { title, dep, color, avaDays, compH } = req.body;
   if (!title) { return res.status(400).json({ message: 'Obrigatório introduzir nome - Servidor' }); }

   const filePath = path.join(__dirname, '/data_ferias/funcionarios.json');
   fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
         console.error('Falha ao ler ficheiro - Servidor:', err);
         return res.status(500).json({ message: 'Falha ao ler dados - Servidor' });
      }

      let content;
      try { content = JSON.parse(data); }
      catch (parseErr) {
         console.error('Parse de ficheiro JSON falhou - Servidor:', parseErr);
         return res.status(500).json({ message: 'Parse de dados falhou - Servidor' });
      }

      const newWorker = {
         id: generateUniqueId(content.workers),
         title,
         dep,
         vacations: [],
         offDays: [],
         color,
         avaDays
      };
      content.workers.push(newWorker);

      fs.writeFile(filePath, JSON.stringify(content, null, 2), (writeErr) => {
         if (writeErr) {
            console.error('Falha ao escrever ficheiro - Servidor:', writeErr);
            return res.status(500).json({ message: 'Falha ao escrever dados - Servidor' });
         }
         res.json({ message: 'Colaborador adicionado com sucesso - Servidor' });
      });
   });
});

// API endpoint para atualizar/editar dados de colaborador - Férias
app.patch('/api/editarColab/:id', async (req, res) => {
   const { id } = req.params;
   const updates = req.body;

   try {
      const filePath = path.join(__dirname, 'data_ferias/funcionarios.json');
      const data = await fs.promises.readFile(filePath, 'utf8');
      let workers = JSON.parse(data).workers;
      const workerIndex = workers.findIndex(worker => worker.id === id);
      if (workerIndex === -1) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }
      workers[workerIndex] = { ...workers[workerIndex], ...updates };
      await fs.promises.writeFile(filePath, JSON.stringify({ workers }, null, 2));

      res.json({ message: 'Colaborador atualizado com sucesso', worker: workers[workerIndex] });
   } catch (error) {
      console.error('Erro ao atualizar dados de colaborador - Servidor:', error);
      res.status(500).json({ message: 'Erro ao atualizar dados de colaborador - Servidor' });
   }
});

// API endpoint para eliminar dados de colaborador - Férias
app.delete('/api/eliminarColab/:id', (req, res) => {
   const { id } = req.params;
   const filePath = path.join(__dirname, 'data_ferias/funcionarios.json');

   fs.readFile(filePath, (err, data) => {
      if (err) {
         console.error('Erro ao ler ficheiro - Servidor:', err);
         return res.status(500).json({ message: 'Erro ao ler ficheiro - Servidor' });
      }
      let workers = JSON.parse(data).workers;
      const index = workers.findIndex(worker => worker.id === id);

      if (index === -1) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }
      workers.splice(index, 1);

      fs.writeFile(filePath, JSON.stringify({ workers }, null, 2), (err) => {
         if (err) {
            console.error('Falha ao escrever ficheiro - Servidor:', err);
            return res.status(500).json({ message: 'Erro ao atualizar dados de colaborador - Servidor' });
         }
         res.json({ message: 'Colaborador eliminado com sucesso' });
      });
   });
});





// |-----------------------------|
// |----- CORRER O SERVIDOR -----|
// |-----------------------------|

app.listen(port, '192.168.0.12', () => { console.log(`Servidor a correr em http://192.168.0.12:${port}`); });

// Validação de caminhos/endpoints para API (Caso a procura de endpoint falhe)
app.use('/api/*', (req, res) => { res.status(404).json({ error: 'API - Caminho/endpoint não encontrado' }); });