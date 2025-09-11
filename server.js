/* |----- INICIALIZAÇÃO DO SERVIDOR -----| */

// Importação de frameworks
require('dotenv').config(); // ------------------------------------------- Variáveis de ambiente
const express = require('express'); // ----------------------------------- Framework essencial para API
const swaggerUi = require('swagger-ui-express'); // ---------------------- Framework de documentação/teste
const cors = require('cors'); // ----------------------------------------- Framework de busca de dados
const { MongoClient } = require('mongodb'); // --------------------------- MongoDB driver
const mongoose = require('mongoose'); // --------------------------------- Esquemas para construção de dados
const path = require('path'); // ----------------------------------------- Permite estabelecer caminhos diretos para sistemas de ficheiros
const dayjs = require('dayjs'); // --------------------------------------- Facilita gestão de datas

// Importação de JRMFérias
const buildPath = path.join(__dirname, '..', 'JRMFerias', 'build'); // --- Caminhos para ficheiros da aplicação WEB JRMFérias (Estático)

// Módulos API
const swaggerSpec = require('./middleware/swagger/swaggerOptions'); // --- Módulo de configuração (documentação/teste)
const credRoutes = require('./routes/cred'); // -------------------------- Módulo para credenciais de autenticação
const feriasRoutes = require('./routes/ferias'); // ---------------------- Módulo para aplicação JRMFérias
const repairRoutes = require('./routes/repair'); // ---------------------- Módulo para aplicação RepairGest v2
const epmRoutes = require('./routes/epm'); // ---------------------------- Módulo para aplicação ElectrexProductManager
const bRoutes = require('./routes/banca'); // ---------------------------- Módulo para aplicação <app testes banca de carga>
//const handleError = require('./utils/handleError'); // ----------------- Util para handling de erros
const getCurrentDateTime = require('./utils/currentTime') // ------------- Util simples para obter hora atual

// Configuração do servidor
const app = express();
const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI; // URI para conectar a MongoDB

// Bases de dados
let dbCredenciais, dbJRMFerias, dbRepairData, dbProdutosElectrex; //dbBanca
// Schemas Mongoose para base de dados
const createCredModel = require('./schemas/Credentials');
const createProdModel = require('./schemas/Category');


// Inicialização de middleware
app.use(express.json({ limit: '1mb' })); // ----------------------------- Funcionalidades básicas Express para funcionalidades do servidor
app.use(express.urlencoded({ // ----------------------------------------- Funcionalidades na gestão e controle durante POST de dados de formulários
   extended: false,
   limit: '1mb',
   parameterLimit: 1000
}));
app.use(cors()); // ----------------------------------------------------- CORS básico para cross-referencing de origens cliente-servidor
app.use('/ferias', express.static(buildPath)); // ----------------------- Permite servir ficheiros estáticos






/* |----- FUNÇÕES PARA FUNCIONALIDADES DO SERVIDOR - Funções "Helper" -----| */

// Testar Routers - DEPRECADO - "express-list-endpoints" removido
//const listEndpoints = require('express-list-endpoints');
//console.log(listEndpoints(app));








/* |----- Conectar ao MongoDB (Base de dados) nativamente -----| */
async function connectToMongoDB() {
   const driverUri = uri + '?authSource=admin';
   const client = new MongoClient(driverUri);

   //try { // "try" blocks já não são necessários em ExpressJS 5.0
   await client.connect();
   dbCredenciais = client.db('CredenciaisElectrex');
   dbJRMFerias = client.db('JRMFerias');
   dbRepairData = client.db('Repair');
   dbProdutosElectrex = client.db('ProdutosElectrex');
   //dbBancaElectrex = client.db('Banca');

   // Testar conexões
   console.log(`${getCurrentDateTime()}`);
   console.log("Conectado à MongoDB: ", dbCredenciais.databaseName);
   console.log("Conectado à MongoDB: ", dbJRMFerias.databaseName);
   console.log("Conectado à MongoDB: ", dbRepairData.databaseName);
   console.log("Conectado à MongoDB: ", dbProdutosElectrex.databaseName);
   //console.log("Conectado à MongoDB: ", dbBancaElectrex.databaseName);

   return { dbCredenciais, dbJRMFerias, dbRepairData, dbProdutosElectrex }; // dbBancaElectrex

   /* erros são nativamente manipulados em ExpressJS 5.0
   } catch (error) {
      console.error("Erro ao conectar à MongoDB: ", error.message);
      throw error;
   }*/
}

/* |----- Conectar ao MongoDB com Mongoose -----| */
function connectToMongooseCred() {
   return new Promise((resolve, reject) => {
      const credConnectionUri = uri + 'CredenciaisElectrex?authSource=admin';
      const conn = mongoose.createConnection(credConnectionUri); // , { useNewUrlParser: true, useUnifiedTopology: true }
      conn.once('open', () => {
         console.log(`${getCurrentDateTime()} - Mongoose connected to CredenciaisElectrex`);
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
         console.log(`${getCurrentDateTime()} - Mongoose connected to ProdutosElectrex`);
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
      app.use('/api/auth', credRoutes(dbCredenciais, dayjs, CredentialModel));
      app.use('/api/ferias', feriasRoutes(dbJRMFerias));
      app.use('/api/repair', repairRoutes(dbRepairData));
      app.use('/api/epm', epmRoutes(dbProdutosElectrex, dayjs, ProductModel));




      /**
       * @openapi
       * /currentDateTime:
       *    get:
       *       summary: API Endpoint generalista para obter data/hora
       *       description: Busca e retorna data e hora atuais como string ISO, não formatada.
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
         /* Sem try/catch — se algo lançar, Express 5 envia para o handler global
         try { 
            const currentDateTime = new Date();
            res.json({ dateTime: currentDateTime.toISOString() }); - lógica modificada para utilizar dayjs
         } catch (error) { handleError(res, error, 500, 'Erro ao buscar data/hora - Servidor'); }
         */
         res.json({ dateTime: dayjs().toDate().toISOString() });
      });



      // |----- Validação de caminhos/endpoints para API (Caso a procura de endpoint falhe) - erro 404 -----|
      app.use('/api', (req, res) => { res.status(404).json({ error: 'API - Caminho/endpoint não encontrado' }); });
      //console.log(listEndpoints(app)); // endpoints agora são listados em Swagger /docs




      /* |----- Error handling central (Express 5) -----|
         - Deteta erros de parsers (ex.: 413) e de async handlers (throw/reject)
         - Não expõe detalhes sensíveis em produção
      */
      app.use((err, req, res, next) => {
         // 413 amigável (body muito grande)
         if (err?.type === 'entity.too.large' || err?.status === 413) {
            return res.status(413).json({ error: 'Payload too large', limit: '1mb' });
         }

         const status = err.statusCode || err.status || 500;
         // Log detalhado no servidor
         console.error(`[${getCurrentDateTime()}]`, err.stack || err);

         // Resposta compacta; em dev, acrescenta detalhes úteis
         const payload = { error: err.publicMessage || 'Erro de servidor' };
         if (process.env.NODE_ENV !== 'production') {
            payload.details = err.message;
            if (err.code) payload.code = err.code;
         }
         if (err.name === 'ValidationError') payload.validation = err.errors;
         if (err.code === 11000) payload.error = 'Duplicado';

         res.status(status).json(payload);
      });




      // Correr o servidor
      app.listen(port, '192.168.0.12', () => {
         console.log(`${getCurrentDateTime()} - Servidor a correr em http://192.168.0.12:${port}`);

         fetch('http://192.168.0.12:' + port + '/api/ferias/incrementavadays', { method: 'POST' })
            .then(response => response.json())
            .then(data => console.log(data.message))
            .catch(error => console.error(`${getCurrentDateTime()} - Erro ao chamar /incrementavadays: `, error));
      });
   }).catch((error) => {
      console.error(`${getCurrentDateTime()} - Falha na conexão ao MongoDB: `, error.message);
      process.exit(1); // Encerrar aplicação em caso de falha na conexão
   });