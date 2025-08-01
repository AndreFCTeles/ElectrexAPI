/* |----- INICIALIZAÇÃO DO SERVIDOR -----| */

// Importação de frameworks
require('dotenv').config(); // ------------------------------------------- Variáveis de ambiente
const express = require('express'); // ----------------------------------- Framework essencial para API
const swaggerUi = require('swagger-ui-express'); // ---------------------- Framework de documentação/teste
const cors = require('cors'); // ----------------------------------------- Framework de busca de dados
const { MongoClient } = require('mongodb'); // --------------------------- MongoDB driver
const mongoose = require('mongoose'); // --------------------------------- Esquemas para construção de dados
const path = require('path'); // ----------------------------------------- Permite estabelecer caminhos diretos para sistemas de ficheiros
const buildPath = path.join(__dirname, '..', 'JRMFerias', 'build'); // --- Caminhos para aplicação WEB JRMFérias
const dayjs = require('dayjs'); // --------------------------------------- Facilita gestão de datas

// Módulos API
const swaggerSpec = require('./middleware/swagger/swaggerOptions'); // --- Módulo de configuração (documentação/teste)
const handleError = require('./utils/handleError'); // ------------------- Módulo handling de erros
const credRoutes = require('./routes/cred'); // -------------------------- Módulo para credenciais de autenticação
const feriasRoutes = require('./routes/ferias'); // ---------------------- Módulo para aplicação JRMFérias
const repairRoutes = require('./routes/repair'); // ---------------------- Módulo para aplicação RepairGest v2
const epmRoutes = require('./routes/epm'); // ---------------------------- Módulo para aplicação ElectrexProductManager

// Configuração do servidor
const app = express();
const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI; // URI para conectar a MongoDB

// Bases de dados
let dbCredenciais, dbJRMFerias, dbRepairData, dbProdutosElectrex;
// Schemas Mongoose para base de dados
const createCredModel = require('./schemas/Credentials');
const createProdModel = require('./schemas/Category');


// Inicialização de middleware
app.use(express.json()); // --------------------------------------------- Funcionalidades básicas Express para funcionalidades do servidor
//app.use(express.urlencoded({ extended: true })); // ------------------- Permite decompor URLs para melhor POST de dados de formulários
app.use(cors()); // ----------------------------------------------------- CORS básico para cross-referencing de origens cliente-servidor
app.use('/ferias', express.static(buildPath)); // ----------------------- Permite servir ficheiros estáticos






/* |----- FUNÇÕES PARA FUNCIONALIDADES DO SERVIDOR - Funções "Helper" -----| */

// Testar Routers
const listEndpoints = require('express-list-endpoints');
//console.log(listEndpoints(app));

// Util para formato data/hora
function getCurrentDateTime() { return dayjs().format('HH:mm, DD/MM/YYYY'); }







/* |----- Conectar ao MongoDB (Base de dados) nativamente -----| */
async function connectToMongoDB() {
   const driverUri = uri + '?authSource=admin';
   const client = new MongoClient(driverUri);
   try {
      await client.connect();
      dbCredenciais = client.db('CredenciaisElectrex');
      dbJRMFerias = client.db('JRMFerias');
      dbRepairData = client.db('Repair');
      dbProdutosElectrex = client.db('ProdutosElectrex');

      // Testar conexões
      console.log("Conectado à MongoDB: ", dbCredenciais.databaseName);
      console.log("Conectado à MongoDB: ", dbJRMFerias.databaseName);
      console.log("Conectado à MongoDB: ", dbRepairData.databaseName);
      console.log("Conectado à MongoDB: ", dbProdutosElectrex.databaseName);
      return { dbCredenciais, dbJRMFerias, dbRepairData, dbProdutosElectrex };
   } catch (error) {
      console.error("Erro ao conectar à MongoDB: ", error.message);
      throw error;
   }
}

/* |----- Conectar ao MongoDB com Mongoose -----| */
function connectToMongooseCred() {
   return new Promise((resolve, reject) => {
      const credConnectionUri = uri + 'CredenciaisElectrex?authSource=admin';
      const conn = mongoose.createConnection(credConnectionUri); // , { useNewUrlParser: true, useUnifiedTopology: true }
      conn.once('open', () => {
         console.log('Mongoose connected to CredenciaisElectrex');
         //const CredentialModel = conn.model('Credential', credentialSchema);
         const CredentialModel = createCredModel(conn);
         resolve(CredentialModel);
      });
      conn.on('error', reject);
   });
}
function connectToMongooseProd() {
   return new Promise((resolve, reject) => {
      const prodConnectionUri = uri + 'ProdutosElectrex?authSource=admin';
      const conn = mongoose.createConnection(prodConnectionUri); // , { useNewUrlParser: true, useUnifiedTopology: true }
      conn.once('open', () => {
         console.log('Mongoose connected to ProdutosElectrex');
         //const ProductModel = conn.model('Product', categorySchema);
         const ProductModel = createProdModel(conn);
         resolve(ProductModel);
      });
      conn.on('error', reject);
   });
}

/*
async function connectToMongooseProd() {
   try {
      prodConnectionUri = uri + 'ProdutosElectrex?authSource=admin';
      await mongoose.connect(prodConnectionUri);
      console.log('Connected to MongoDB with Mongoose:', mongoose.connection.name);
   } catch (error) {
      console.error('Erro ao conectar o Mongoose ao MongoDB:', error.message);
      throw error;
   }
}
*/


/* |----- Inicializar Endpoints / Routers -----| */
Promise.all([
   connectToMongoDB(),
   connectToMongooseCred(),
   connectToMongooseProd()
])
   .then(([mongoResult, CredentialModel, ProductModel]) => {
      const { dbCredenciais, dbJRMFerias, dbRepairData, dbProdutosElectrex } = mongoResult;

      // API Endpoints/Routes para servir documentação
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

      // API Endpoints/Routes para servir aplicações
      app.use('/api/cred', credRoutes(dbCredenciais, dayjs, CredentialModel));
      app.use('/api/ferias', feriasRoutes(dbJRMFerias));
      app.use('/api/repair', repairRoutes(dbRepairData));
      app.use('/api/epm', epmRoutes(dbProdutosElectrex, dayjs, ProductModel));


      /**
       * @openapi
       * /currentDateTime:
       *    get:
       *       summary: API Endpoint generalista para buscar data/hora
       *       description: Busca data e hora atuais como string ISO, não formatado
       *       tags:
       *          - Geral
       *       responses:
       *          '200':
       *             description: Sucesso ao buscar data e hora
       *             content:
       *                'application/json':
       *                   schema:
       *                      type: object
       *                      properties:
       *                         dateTime:
       *                            type: string
       *                            example: "2025-07-08T08:46:04.660Z"
       *          '500':
       *             description: Erro de servidor/API ao buscar data/hora
       */
      app.get('/api/currentDateTime', (req, res) => {
         try {
            const currentDateTime = new Date();
            res.json({ dateTime: currentDateTime.toISOString() });
         } catch (error) { handleError(res, error, 500, 'Erro ao buscar data/hora - Servidor'); }
      });

      // Validação de caminhos/endpoints para API (Caso a procura de endpoint falhe)
      app.use('/api/*', (req, res) => { res.status(404).json({ error: 'API - Caminho/endpoint não encontrado' }); });

      console.log(listEndpoints(app));

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
      const currentDateTime = getCurrentDateTime();
      console.error(`${currentDateTime} - Falha na conexão ao MongoDB:`, error.message);
      process.exit(1); // Encerrar aplicação em caso de falha na conexão
   });