/* |----- INICIALIZAÇÃO DO SERVIDOR -----| */

// importação de frameworks
const express = require('express'); // ---------------- Framework essencial para API
const cors = require('cors'); // ---------------------- Framework de busca de dados
const fs = require('fs').promises; // ----------------- Framework para sistema de ficheiros
const { MongoClient } = require('mongodb'); // -------- MongoDB driver
const path = require('path'); // ---------------------- Libraria para filesystem

// configuração do servidor
const app = express();
const port = 3000;
const dataFilePath = path.join(__dirname, 'files');

// URI para conectar a MongoDB
const uri = "mongodb://adminUser:adminPass@localhost:27017/myDatabase?authSource=admin";

// Cliente MongoDB
const client = new MongoClient(uri);

// Inicialização de frameworks
app.use(express.json());  // -------------------------- Funcionalidades básicas Express para funcionalidades do servidor
app.use(express.urlencoded({ extended: true })); // --- Permite decompor URLs para melhor POST de dados de formulários
app.use(cors()); // ----------------------------------- CORS básico para cross-referencing de origens cliente-servidor
app.use('/files', express.static(dataFilePath)); // --- Servir ficheiros JSON estáticos a partir de caminho

// Conectar ao MongoDB
async function connectToMongoDB() {
   try {
      await client.connect();
      console.log("Connected to MongoDB");
   } catch (error) {
      console.error("Could not connect to MongoDB:", error);
      process.exit(1);
   }
}





/* |----- FUNÇÕES PARA FUNCIONALIDADES DO SERVIDOR - Funções "Helper" -----| */

/**
 * Lê ficheiros JSON de forma assíncrona
 * @param {string} fileName - Nome do ficheiro a ler
 * @returns {Promise<any[]>} - Uma promessa que resolve com dados parsed (decomposto) a partir de JSON
 */

// Ler ficheiro JSON
async function readJsonFile(fileName) {
   const filePath = path.join(dataFilePath, fileName);
   try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(fileContent);
   }
   catch (error) { throw error; }
}

// Tratamento de erros
const handleError = (res, error, message = 'Erro') => {
   console.error(`${message}: ${error.message}`);
   res.status(500).json({ error: message });
};

/**
 * Filtragem de dados
 * @param {Array} data - O conjunto de dados a filtrar.
 * @param {string} filters - Filtro a ser usado.
 * @returns {Array} - Os dados filtrados.
 */
//function applyFilters(data, cliente) { return !cliente ? data : data.filter(item => item.Cliente && item.Cliente === cliente); }
function applyFilters(data, filters) {
   return data.filter(item => {
      return Object.keys(filters).every(filterKey => {
         if (!filters[filterKey]) return true; // Se nenhum filtro for declarado, ignorar este filtro
         if (!item[filterKey]) return false; // Se o item não contém o campo estabelecido como filtro, excluir item
         return item[filterKey].toString().toLowerCase() === filters[filterKey].toLowerCase();
      });
   });
}

// Paginar data caso seja pedido no frontend
function paginateData(data, page, pageSize) {
   // Contagem de items/páginas
   const totalItems = data.length;
   const totalPages = Math.ceil(totalItems / pageSize);

   // Calcular inicio e fim baseado em parâmetros de paginação
   const startIndex = (page - 1) * pageSize;
   const endIndex = startIndex + pageSize;
   const paginatedData = data.slice(startIndex, endIndex)// Fetch, retornar subset consoante paginação;
   return {
      data: paginatedData,
      totalItems,
      totalPages,
      currentPage: page
   };
}





/* |----- FUNÇÕES PARA COMPARAÇÃO/ORDENAÇÃO DE VALORES -----| */

// Algoritmo Timsort - https://pt.wikipedia.org/wiki/Timsort
const compareValues = (a, b, field, sortOrder) => {
   let valueA = a[field], valueB = b[field];

   if (valueA instanceof Date && valueB instanceof Date) { // Comparar datas
      valueA = valueA.getTime();
      valueB = valueB.getTime();
   } else if (Array.isArray(valueA) && Array.isArray(valueB)) { // Comparar arrays
      valueA = valueA[0]?.toString().charAt(0) || "";
      valueB = valueB[0]?.toString().charAt(0) || "";
   }

   return sortOrder === 'asc' ? valueA < valueB ? -1 : 1 : valueA > valueB ? -1 : 1;
};





// |----------------------------|
// |----- ENDPOINTS DA API -----|
// |----------------------------|


// |----- ENDPOINTS DE BUSCA -----|

// API endpoint para buscar dados (pre-paginados, pre-ordenados)
app.get('/api/getpagdata', async (req, res) => {
   try {
      const { dataType, sortField = "DataTime", sortOrder = 'desc', page = 1, pageSize = 30, ...filters } = req.query; // valores por defeito de paginação e ordenação
      const data = await readJsonFile(`${dataType}.json`);

      if (!Array.isArray(data)) { throw new Error('Dados num formato inesperado - Servidor'); }
      const filteredData = applyFilters(data, filters); // aplica filtros se necessário

      const effectiveSortField = // Analisa que ordenação é aplicada por defeito
         data[0] && data[0].hasOwnProperty(sortField) ? sortField :
            data[0] && data[0].hasOwnProperty('ID') ? 'ID' : '_id';

      filteredData.sort((a, b) => compareValues(a, b, effectiveSortField, sortOrder));
      const paginatedResult = paginateData(filteredData, parseInt(page, 10), parseInt(pageSize, 10));
      res.json(paginatedResult);
   } catch (error) { handleError(res, error, 400, 'Erro ao buscar dados paginados - Servidor'); }
});


// API endpoint para buscar dados
app.get('/api/getdata', async (req, res) => {
   try {
      const { dataType, sortField = "DateTime", sortOrder = 'asc' } = req.query;
      const data = await readJsonFile(`${dataType}.json`);

      if (!Array.isArray(data)) { throw new Error('Dados num formato inesperado - Servidor'); }
      const effectiveSortField =
         data[0] && data[0].hasOwnProperty(sortField) ? sortField :
            data[0] && data[0].hasOwnProperty('ID') ? 'ID' : '_id';

      data.sort((a, b) => compareValues(a, b, effectiveSortField, sortOrder));
      res.json({ data });
   } catch (error) { handleError(res, error, 400, 'Erro ao buscar dados paginados - Servidor'); }
});


// API endpoint para buscar data/hora
app.get('/api/currentDateTime', (req, res) => {
   try {
      const currentDateTime = new Date();
      res.json({ dateTime: currentDateTime.toISOString() });
   } catch (error) { handleError(res, error, 400, 'Erro ao buscar data/hora - Servidor'); }
});





// |----- ENDPOINTS DE ESCRITA -----|

// API endpoint para escrever dados - WIP
app.post('/api/novareparmaq', async (req, res) => {
   try {
      const fileName = req.query.fileName || 'tblRepairList.json';
      const jsonData = await readJsonFile(fileName);
      const newRepar = req.body;
      jsonData.push(newRepar);
      const filePath = path.join(dataFilePath, fileName);
      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
      res.status(201).json({ success: true, data: newRepar });
   } catch (error) {
      handleError(res, error, 'Erro ao escrever dados - Servidor');
   }
});

// API endpoint para escrever dados - WIP
app.post('/api/novareparcir', async (req, res) => {
   try {
      const fileName = req.query.fileName || 'tblCircuitoList.json';
      const jsonData = await readJsonFile(fileName);
      const newRepar = req.body;
      jsonData.push(newRepar);
      const filePath = path.join(dataFilePath, fileName);
      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
      res.status(201).json({ success: true, data: newRepar });
   } catch (error) {
      handleError(res, error, 'Erro ao escrever dados - Servidor');
   }
});

// API endpoint para login - WIP
app.post('/api/login', async (req, res) => {
   try {
      const { user, password } = req.body;
      const jsonData = await readJsonFile('login.json');
      const userMatch = jsonData.reparacoes.find((u) => u.user === user && u.password === password);

      if (userMatch) {
         res.json({ success: true, user: userMatch });
      } else {
         res.status(401).json({ success: false, message: 'Credenciais inválidas - Servidor' });
      }
   } catch (error) {
      handleError(res, error, 'Erro durante autenticação - Servidor');
   }
});






/* |----- CORRER SERVIDOR -----| */

app.listen(port, () => { console.log(`Servidor a correr em http://localhost:${port}`); });
