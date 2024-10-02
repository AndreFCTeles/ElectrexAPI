/* |----- INICIALIZAÇÃO DO SERVIDOR -----| */

// Importação de frameworks
require('dotenv').config(); // ------------------------------------------ Variáveis de ambiente
const express = require('express'); // ---------------------------------- Framework essencial para API
//const { body, validationResult } = require('express-validator'); // --- Validação de dados
const cors = require('cors'); // ---------------------------------------- Framework de busca de dados
//const cron = require('node-cron'); // --------------------------------- Extensão para incremento periódico de dados (dias de férias)
const { MongoClient } = require('mongodb'); // -------------------------- MongoDB driver
//const fs = require('fs'); // ------------------------------------------ Permite recurso a sistemas de ficheiros
const path = require('path'); // ---------------------------------------- Permite estabelecer caminhos diretos para sistemas de ficheiros
const buildPath = path.join(__dirname, '..', 'JRMFerias', 'build'); //--- Caminhos para aplicação WEB JRMFérias
const dayjs = require('dayjs'); // -------------------------------------- Facilita gestão de datas

// Módulos API
const handleError = require('./utils/handleError'); // ------------------ Módulo handling de erros
const feriasRoutes = require('./routes/ferias'); // --------------------- Módulo para aplicação JRMFérias
const repairRoutes = require('./routes/repair'); // --------------------- Módulo para aplicação RepairGest v2
const epmRoutes = require('./routes/epm'); // --------------------------- Módulo para aplicação ElectrexProductManager


// Configuração do servidor
const app = express();
const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI; // URI para conectar a MongoDB
//const client = new MongoClient(uri);// Cliente MongoDB

// Bases de dados
let dbJRMFerias, dbRepairData, dbProdutosElectrex;

// Inicialização de middleware
app.use(express.json());  // ------------------------------------------- Funcionalidades básicas Express para funcionalidades do servidor
//app.use(express.urlencoded({ extended: true })); // ------------------ Permite decompor URLs para melhor POST de dados de formulários
app.use(cors()); // ---------------------------------------------------- CORS básico para cross-referencing de origens cliente-servidor
app.use(express.static(buildPath)); // --------------------------------- Permite servir ficheiros estáticos






/* |----- FUNÇÕES PARA FUNCIONALIDADES DO SERVIDOR - Funções "Helper" -----| */

// Testar Routers
const listEndpoints = require('express-list-endpoints');
console.log(listEndpoints(app));

/* |----- Conectar ao MongoDB / Base de dados -----| */
function getCurrentDateTime() { return dayjs().format('HH:mm, DD/MM/YYYY'); }







/* |----- Conectar ao MongoDB / Base de dados -----| */
async function connectToMongoDB() {
   const client = new MongoClient(uri);
   try {
      await client.connect();
      dbJRMFerias = client.db('JRMFerias');
      dbRepairData = client.db('Repair');
      dbProdutosElectrex = client.db('ProdutosElectrex');

      // Testar conexões
      //console.log("Conectado à MongoDB: ", dbJRMFerias.databaseName);
      //console.log("Conectado à MongoDB: ", dbRepairData.databaseName);
      //console.log("Conectado à MongoDB: ", dbProdutosElectrex.databaseName);
      return { dbJRMFerias, dbRepairData, dbProdutosElectrex };
   } catch (error) {
      console.error("Erro ao conectar à MongoDB: ", error.message);
      throw error;
   }
}



/* |----- Inicializar Endpoints / Routers -----| */
console.log('test');
connectToMongoDB().then(({ dbJRMFerias, dbRepairData, dbProdutosElectrex }) => {
   // API Endpoints/Routes para servir aplicações
   app.use('/api/ferias', feriasRoutes(dbJRMFerias));
   app.use('/api/repair', repairRoutes(dbRepairData));
   app.use('/api/epm', epmRoutes(dbProdutosElectrex));

   // API Endpoints generalista para buscar data/hora
   app.get('/api/currentDateTime', (req, res) => {
      try {
         const currentDateTime = new Date();
         res.json({ dateTime: currentDateTime.toISOString() });
      } catch (error) { handleError(res, error, 500, 'Erro ao buscar data/hora - Servidor'); }
   });

   // Validação de caminhos/endpoints para API (Caso a procura de endpoint falhe)
   app.use('/api/*', (req, res) => { res.status(404).json({ error: 'API - Caminho/endpoint não encontrado' }); });

   console.log(listEndpoints(app));
   console.log('test2');

   // Correr o servidor
   app.listen(port, '192.168.0.12', () => {
      const currentDateTime = getCurrentDateTime();
      console.log(`Servidor a correr em http://192.168.0.12:${port} - Data: ${currentDateTime}`);

      fetch('http://192.168.0.12:' + port + '/api/ferias/incrementavadays', { method: 'POST' })
         .then(response => response.json())
         .then(data => console.log(data.message))
         .catch(error => console.error('Erro ao chamar /incrementavadays:', error));
   });
}).catch((error) => {
   console.error('Falha na conexão ao MongoDB:', error.message);
   process.exit(1); // Encerrar aplicação em caso de falha na conexão
});