module.exports = (dbJRMFerias) => {
   // Importações
   const express = require('express');
   //const { body, validationResult } = require('express-validator'); // atualmente em desuso
   const router = express.Router();
   const dayjs = require('dayjs');
   const norm = require('../utils/ferias/normalize');
   const generateUniqueId = require('../utils/ferias/generateUniqueId');
   const getCurrentDateTime = require('../utils/currentTime')
   const handleError = require('../utils/handleError'); // Não necessário em ExpressJS 5.0




   // Middleware para assegurar conexão à DB
   router.use(async (req, res, next) => { next(); });
   //console.log(`${ getCurrentDateTime()} - Router ferias.js inicializado com db:`, dbJRMFerias.databaseName);




   /* |----- Função para verificar e atualizar avaDays anualmente -----| */
   async function checkAndUpdateAnnualIncrements() {
      const currentYear = dayjs().year(); // new Date().getFullYear(); - antes de implementação de dayjs
      const dbIncrementoAnual = dbJRMFerias.collection('IncrementoAnual');
      const globalSettings = await dbIncrementoAnual.findOne({ _id: "global" });

      if (globalSettings && globalSettings.lastIncrementYear >= currentYear) {
         console.log(`${getCurrentDateTime()} - Incremento já foi realizado para ano corrente: ${globalSettings.lastIncrementYear}. A saltar atualização...`);
         return;
      }
      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const workers = await collection.find({}).toArray();
         for (const worker of workers) {
            const days = 22;
            //worker.avaDays += days;  // Número de dias a incrementar
            worker.avaDays = (worker.avaDays ?? 0) + days;
            await collection.updateOne({ id: worker.id }, {
               $set: { avaDays: worker.avaDays }
            });
            console.log(`${getCurrentDateTime()} - Colaborador ${worker.id} recebeu +${days} para ausências. Dias atuais: ${worker.avaDays}`);
         }
         // Atualizar o último ano em que incremento foi realizado
         await dbIncrementoAnual.updateOne(
            { _id: "global" },
            { $set: { lastIncrementYear: currentYear } }
         );
         console.log(`${getCurrentDateTime()} - ${workers.length} colaboradores atualizados para o ano ${currentYear}.`);
      } catch (error) { console.error(`${getCurrentDateTime()} - Erro ao incrementar dias disponíveis:`, error); }
   }


   /* |----- Util de deteção de fecho da empresa -----| */
   const BUSINESS_WORKER_ID = '1'; // Electrex (dep: JRMatos)

   // Computação de dias de ausência em função de eventos Electrex (decrementa avaDays a todos os workers)
   const computeDeductionDaysForAbsence = (abs) => {
      // Contar avadays (apenas dias úteis não parciais)
      // Prioridade - especificar busDays se providenciado, senão:
      if (typeof abs?.busDays === 'number' && abs.busDays >= 0) return abs.busDays;
      if (abs?.allDay === true) return 1; // Fallbacks - cria ausências parciais (off-day) sem busDays (dias úteis)
      return 0; // ausências parciais não afetam avaDays
   }





   // |----- ENDPOINTS DE BUSCA -----|

   // API endpoint para receber dados de login - Férias
   /**
    * @openapi
    * /ferias/getloginferias:
    *   get:
    *     summary: Obter credenciais internas do módulo Férias
    *     description: (Depreciado pelo novo sistema de login) Devolve a coleção interna de credenciais (uso administrativo/testes).
    *     tags: [Ferias]
    *     responses:
    *       200:
    *         description: Credenciais devolvidas
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 credentials:
    *                   type: array
    *                   items: { type: object }
    *       500: { description: Erro ao buscar dados de login }
    */
   router.get('/getloginferias', async (req, res) => {
      try {
         const collection = dbJRMFerias.collection('Credenciais');
         const credentials = await collection.find({}).toArray();
         res.json({ credentials });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao buscar dados de login - Servidor`); }
   });

   // API endpoint para receber dados de colaboradores e ausências - Férias
   /**
    * @openapi
    * /ferias/getferias:
    *   get:
    *     summary: Obter colaboradores e eventos (férias/dias)
    *     description: Lista todos os colaboradores com os seus eventos de férias e dias de ausência.
    *     tags: [Ferias]
    *     responses:
    *       200:
    *         description: Colaboradores + eventos devolvidos
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 workers:
    *                   type: array
    *                   items: { $ref: '#/components/schemas/Worker' }
    *       500: { description: Erro ao buscar dados de colaboradores }
    */
   router.get('/getferias', async (req, res) => {
      console.log("GET request para /getferias");
      try {
         console.log("A buscar dados...");
         const collection = dbJRMFerias.collection('Funcionarios');
         const workers = await collection.find({}).toArray();
         //console.log("Data fetched:", workers);
         console.log(`${getCurrentDateTime()} - Dados de colaborador buscados com sucesso: ${workers.length}`);
         res.json({ workers });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao buscar dados - Servidor`); }
   });

   // API endpoint para receber dados de colaboradores e ausências - Férias
   /**
    * @openapi
    * /ferias/getdepartments:
    *   get:
    *     summary: Obter departamentos
    *     description: Devolve a lista de departamentos existentes.
    *     tags: [Ferias]
    *     responses:
    *       200:
    *         description: Departamentos devolvidos
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 departments:
    *                   type: array
    *                   items: { $ref: '#/components/schemas/Department' }
    *       500: { description: Erro ao buscar departamentos }
    */
   router.get('/getdepartments', async (req, res) => {
      try {
         const depCollection = dbJRMFerias.collection('Departamentos');
         const departments = await depCollection.find({}).toArray();
         res.json({ departments });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao buscar departamentos`); }
   });





   // |----- ENDPOINTS DE ESCRITA -----|

   /* |----- Rota para Forçar a Atualização Anual -----| */
   /**
    * @openapi
    * /ferias/incrementavadays:
    *   post:
    *     summary: Incremento anual de dias disponíveis
    *     description: Força o incremento anual de **22** dias de férias disponíveis (`avaDays`) para todos os colaboradores, se ainda não aplicado no ano corrente.
    *     tags: [Ferias]
    *     responses:
    *       200: { description: Incremento verificado/aplicado }
    *       500: { description: Erro ao executar incremento anual }
    */
   router.post('/incrementavadays', async (req, res) => {
      console.log(`${getCurrentDateTime()} - POST request to /incrementavadays`);
      try {
         await checkAndUpdateAnnualIncrements();
         res.json({ message: `${getCurrentDateTime()} - Incremento anual verificado e aplicado se necessário.` });
      } catch (error) {
         handleError(res, error, `${getCurrentDateTime()} - Erro ao executar incremento anual`);
      }
   });



   // FÉRIAS - EVENTOS
   // API endpoint para escrita de dados de ausência - Férias
   /**
    * @openapi
    * /ferias/postferias:
    *   post:
    *     summary: Registar evento de ausência/férias
    *     description: Adiciona um evento de férias (`type = "vacation"`) ou ausência (`type = "off-day"`) a um colaborador e atualiza automaticamente os contadores (`avaDays`/`compH`).
    *     tags: [Ferias]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [id, absence, type]
    *             properties:
    *               id: { type: string, description: ID do colaborador }
    *               type: { type: string, enum: [vacation, off-day] }
    *               absence:
    *                 $ref: '#/components/schemas/AbsenceInput'
    *     responses:
    *       200: { description: Evento criado }
    *       400: { description: Validação inválida (campos em falta ou incoerentes) }
    *       404: { description: Colaborador não encontrado }
    *       500: { description: Erro ao adicionar evento }
    */
   router.post('/postferias', async (req, res) => {
      const { id, absence, type } = req.body;
      if (!id || !absence || !type) { return handleError(res, null, `${getCurrentDateTime()} - Campos obrigatórios em falta - Servidor`); }
      if (!absence.start || !absence.end) { return handleError(res, null, `${getCurrentDateTime()} - Dados de ausência inválidos - Servidor`); }

      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const worker = await collection.findOne({ id });
         if (!worker) { return handleError(res, null, `${getCurrentDateTime()} - Colaborador não encontrado - Servidor`); }

         if (type === 'vacation') {
            worker.avaDays -= absence.busDays || 0;
            worker.vacations.push(absence);
         } else if (type === 'off-day') {
            if (absence.allDay) { worker.avaDays -= 1; }
            else { worker.compH = (worker.compH || 0) + (absence.absTime || 0); }
            worker.offDays.push(absence);
         } else { return handleError(res, null, `${getCurrentDateTime()} - Tipo inválido - Servidor`); }

         await collection.updateOne({ id }, { $set: worker });
         if (id === BUSINESS_WORKER_ID) {
            let deduction = 0;
            if (type === 'vacation') {
               deduction = computeDeductionDaysForAbsence(absence);
            } else if (type === 'off-day' && absence.allDay) {
               deduction = computeDeductionDaysForAbsence(absence);
            }

            if (deduction > 0) {
               await dbJRMFerias.collection('Funcionarios').updateMany(
                  { id: { $ne: BUSINESS_WORKER_ID } },
                  { $inc: { avaDays: -deduction } }
               );
            }
         }
         res.json({ message: `${getCurrentDateTime()} - Ausência adicionada com sucesso - Servidor` });
      } catch (error) {
         handleError(res, error, `${getCurrentDateTime()} - Erro ao adicionar ausência - Servidor`);
      }
   });
   // FÉRIAS - COLABORADOR
   // API endpoint para escrita de dados de colaboradores - Férias
   /**
    * @openapi
    * /ferias/novocolab:
    *   post:
    *     summary: Criar colaborador (cria departamento se necessário)
    *     description: Cria um colaborador. Se o departamento não existir, é gerado automaticamente e usado o `depDefColor` como cor por omissão.
    *     tags: [Ferias]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [title, dep]
    *             properties:
    *               title: { type: string, description: Nome curto do colaborador }
    *               displayName: { type: string, description: Nome a apresentar (opcional) }
    *               dep: { type: string, description: Departamento do colaborador }
    *               color: { type: string, example: "#ff0000" }
    *               avaDays: { type: integer, example: 22 }
    *     responses:
    *       200: { description: Colaborador criado }
    *       400: { description: Campos obrigatórios em falta }
    *       409: { description: Conflito/Duplicado (ex.: corrida na criação do departamento) }
    *       500: { description: Erro ao adicionar colaborador }
    */
   router.post('/novocolab', async (req, res) => {
      const { title, displayName, dep, color, avaDays } = req.body;
      const rawDep = req.body.dep;
      if (!title || !dep) { return handleError(res, null, `${getCurrentDateTime()} - Obrigatório introduzir nome e departamento - Servidor`); }

      try {
         const key = norm(rawDep);
         const workCollection = dbJRMFerias.collection('Funcionarios');
         const depCollection = dbJRMFerias.collection('Departamentos');

         let department = await depCollection.findOne({ depKey: key });
         if (!department) {
            try {
               await depCollection.insertOne({
                  depName: rawDep,
                  depKey: key,
                  depDefColor: color || '#000000'
               });
               department = await depCollection.findOne({ depKey: key });
            } catch (e) {
               // Caso dois utilizadores tentem inserir o mesmo departamento ao mesmo tempo (raced with another request)
               if (e?.code === 11000) department = await depCollection.findOne({ depKey: key });
               else throw e;
            }
         }

         const worker = await workCollection.find({}).toArray();
         const newWorker = {
            id: generateUniqueId(worker), // Gerar ID único, com base nos colaboradores existentes
            title,
            displayName: displayName || '',
            dep: department.depName,
            vacations: [],
            offDays: [],
            color: color || department.depDefColor || '#000000',
            avaDays
         };
         await workCollection.insertOne(newWorker);
         res.json({ message: `${getCurrentDateTime()} - Colaborador adicionado com sucesso - Servidor` });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao adicionar colaborador - Servidor`); }
   });





   // |----- ENDPOINTS DE ATUALIZAÇÃO -----|

   // FÉRIAS - EVENTOS
   // API endpoint para atualizar/editar dados de ausência - Férias
   /**
    * @openapi
    * /ferias/editferias/{eventId}:
    *   patch:
    *     summary: Editar/mover evento de ausência (recalcula contadores)
    *     description: Edita um evento existente e ajusta `avaDays`/`compH`. Se o tipo do evento mudar, o evento é movido entre as listas (`vacations`/`offDays`).
    *     tags: [Ferias]
    *     parameters:
    *       - in: path
    *         name: eventId
    *         required: true
    *         schema: { type: string }
    *         description: ID do evento no formato `{workerId}-{tipo}-{uniqueId}`.
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/EditAbsenceInput'
    *     responses:
    *       200: { description: Evento atualizado }
    *       404: { description: Colaborador ou evento não encontrado }
    *       500: { description: Erro ao atualizar evento }
    */
   router.patch('/editferias/:eventId', async (req, res) => {
      const { eventId } = req.params;
      const updates = req.body;
      const [workerId, absenceTypeCode] = eventId.split("-");
      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const worker = await collection.findOne({ id: workerId });
         if (!worker) return handleError(res, null, `${getCurrentDateTime()} - Colaborador não encontrado - Servidor`);
         const currentEventType = absenceTypeCode === '1' ? 'vacations' : 'offDays';
         const newEventType = updates.type === 'vacation' ? 'vacations' : 'offDays';
         const eventList = worker[currentEventType] || [];
         if (!eventList.length) return handleError(res, null, `${getCurrentDateTime()} - Evento não encontrado - Servidor`);
         const eventIndex = eventList.findIndex(e => e.id === eventId);
         if (eventIndex === -1) return handleError(res, null, `${getCurrentDateTime()} - Evento não encontrado - Servidor`);
         const oldEvent = eventList[eventIndex];

         // Ajustar avaDays ou compH com base no evento a ser modificado
         if (currentEventType === 'vacations') {
            worker.avaDays += oldEvent.busDays || 0;
         } else if (currentEventType === 'offDays') {
            if (oldEvent.allDay) { worker.avaDays += 1; }
            else { worker.compH = (worker.compH || 0) - (oldEvent.absTime || 0); }
         }

         // Determinar se worker é Electrex
         const isBusiness = workerId === BUSINESS_WORKER_ID;
         let oldDeduction = 0;
         if (isBusiness) {
            if (currentEventType === 'vacations') {
               oldDeduction = computeDeductionDaysForAbsence(oldEvent);
            } else if (currentEventType === 'offDays' && oldEvent.allDay) {
               oldDeduction = computeDeductionDaysForAbsence(oldEvent);
            }
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

         // Mover evento se o tipo for mudado
         if (currentEventType !== newEventType) {
            worker[currentEventType].splice(eventIndex, 1);
            worker[newEventType].push(updatedEvent);
         } else { worker[currentEventType].splice(eventIndex, 1, updatedEvent); } // Atualizar evento no array

         let newDeduction = 0;
         if (isBusiness) {
            if (newEventType === 'vacations') {
               newDeduction = computeDeductionDaysForAbsence(updatedEvent);
            } else if (newEventType === 'offDays' && updatedEvent.allDay) {
               newDeduction = computeDeductionDaysForAbsence(updatedEvent);
            }
         }

         await collection.updateOne({ id: workerId }, { $set: worker });
         if (isBusiness) {
            const delta = newDeduction - oldDeduction; // + => take more, − => give back
            if (delta !== 0) {
               await dbJRMFerias.collection('Funcionarios').updateMany(
                  { id: { $ne: BUSINESS_WORKER_ID } },
                  { $inc: { avaDays: -delta } }
               );
            }
         }
         res.json({ message: `${getCurrentDateTime()} - Evento atualizado com sucesso`, event: updatedEvent });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao atualizar dados de evento - Servidor`); }
   });

   // FÉRIAS - COLABORADOR
   // API endpoint para atualizar/editar dados de colaborador - Férias
   /**
    * @openapi
    * /ferias/editarColab/{id}:
    *   patch:
    *     summary: Atualizar dados de colaborador
    *     description: Atualiza dados gerais do colaborador (ex.: departamento, cor, nome). Se o departamento mudar e ficar órfão, é removido.
    *     tags: [Ferias]
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
    *             type: object
    *             properties:
    *               title: { type: string }
    *               displayName: { type: string }
    *               dep: { type: string }
    *               color: { type: string }
    *               avaDays: { type: integer }
    *     responses:
    *       200: { description: Colaborador atualizado }
    *       404: { description: Colaborador não encontrado }
    *       500: { description: Erro ao atualizar colaborador }
    */
   router.patch('/editarColab/:id', async (req, res) => {
      const { id } = req.params;
      //const updates = { ...req.body }; //const updates = req.body;
      const updates = req.body;

      try {
         const workCollection = dbJRMFerias.collection('Funcionarios');
         const depCollection = dbJRMFerias.collection('Departamentos');

         // verificar dados de colaborador atuais
         const worker = await workCollection.findOne({ id });
         if (!worker) return handleError(res, null, `${getCurrentDateTime()} - Colaborador não encontrado - Servidor`);

         // verificar dados de departamento atuais
         const originalDep = worker.dep;
         const key = norm(updates.dep);
         let department = await depCollection.findOne({ depKey: key });
         if (!department) {
            try {
               await depCollection.insertOne({
                  depName: updates.dep,
                  depKey: key,
                  depDefColor: updates.color || '#000000',
               });
               department = await depCollection.findOne({ depKey: key });
            } catch (e) {
               if (e?.code === 11000) department = await depCollection.findOne({ depKey: key });
               else throw e;
            }
            updates.dep = department.depName;
         }

         // update
         const result = await workCollection.updateOne({ id }, { $set: updates });
         if (result.matchedCount === 0) { return handleError(res, null, `${getCurrentDateTime()} - Colaborador não encontrado - Servidor`); }

         // se departamento mudou, verificar se departamento original fica órfão
         if (updates.dep && updates.dep !== originalDep) {
            const remaining = await workCollection.countDocuments({ dep: originalDep }); // contar quantos colaboradores têm o dep
            if (remaining === 0) { await depCollection.deleteOne({ depName: originalDep }); } // eliminar dep órfão
         }

         res.json({ message: `${getCurrentDateTime()} - Colaborador atualizado com sucesso` });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao atualizar dados de colaborador - Servidor`); }
   });






   // |----- ENDPOINTS DE REMOÇÃO -----|

   // FÉRIAS - EVENTOS
   // API endpoint para eliminar dados de ausência - Férias
   /**
    * @openapi
    * /ferias/deleteferias/{eventId}:
    *   delete:
    *     summary: Eliminar evento de ausência (recalcula contadores)
    *     description: Remove um evento de ausência/férias e atualiza automaticamente `avaDays`/`compH`.
    *     tags: [Ferias]
    *     parameters:
    *       - in: path
    *         name: eventId
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200: { description: Evento eliminado }
    *       404: { description: Colaborador ou evento não encontrado }
    *       500: { description: Erro ao eliminar evento }
    */
   router.delete('/deleteferias/:eventId', async (req, res) => {
      const { eventId } = req.params;
      const [workerId, absenceTypeCode, eventUniqueId] = eventId.split("-");
      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const worker = await collection.findOne({ id: workerId });
         if (!worker) return handleError(res, null, `${getCurrentDateTime()} - Colaborador não encontrado - Servidor`);
         const eventType = absenceTypeCode === '1' ? 'vacations' : 'offDays';
         const eventList = worker[eventType];
         const eventIndex = eventList.findIndex(e => e.id === eventId);
         if (eventIndex === -1) return handleError(res, null, `${getCurrentDateTime()} - Evento não encontrado - Servidor`);
         const oldEvent = eventList[eventIndex];

         // Ajustar avaDays ou compH com base no evento a ser removido
         if (eventType === 'vacations') {
            worker.avaDays += oldEvent.busDays || 0;
         } else if (eventType === 'offDays') {
            if (oldEvent.allDay) { worker.avaDays += 1; }
            else { worker.compH = (worker.compH || 0) - (oldEvent.absTime || 0); }
         }

         // Remover evento
         eventList.splice(eventIndex, 1);
         await collection.updateOne({ id: workerId }, { $set: worker });
         const isBusiness = workerId === BUSINESS_WORKER_ID;
         if (isBusiness) {
            let restore = 0;
            if (eventType === 'vacations') {
               restore = computeDeductionDaysForAbsence(oldEvent);
            } else if (eventType === 'offDays' && oldEvent.allDay) {
               restore = computeDeductionDaysForAbsence(oldEvent);
            }

            if (restore > 0) {
               await dbJRMFerias.collection('Funcionarios').updateMany(
                  { id: { $ne: BUSINESS_WORKER_ID } },
                  { $inc: { avaDays: +restore } }
               );
            }
         }
         res.json({ message: `${getCurrentDateTime()} - Evento eliminado com sucesso` });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao eliminar evento - Servidor`); }
   });

   // FÉRIAS - COLABORADOR
   // API endpoint para eliminar dados de colaborador - Férias
   /**
    * @openapi
    * /ferias/eliminarColab/{id}:
    *   delete:
    *     summary: Eliminar colaborador (remove departamentos órfãos)
    *     description: Elimina um colaborador e, se o seu departamento ficar sem membros, o departamento é removido automaticamente.
    *     tags: [Ferias]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200: { description: Colaborador eliminado }
    *       404: { description: Colaborador não encontrado }
    *       500: { description: Erro ao eliminar colaborador }
    */
   router.delete('/eliminarColab/:id', async (req, res) => {
      const { id } = req.params;
      try {
         const workCollection = dbJRMFerias.collection('Funcionarios');
         const depCollection = dbJRMFerias.collection('Departamentos');

         const worker = await workCollection.findOne({ id });
         if (!worker) { return handleError(res, null, `${getCurrentDateTime()} - Colaborador não encontrado - Servidor`); }

         const depName = worker.dep;
         const result = await workCollection.deleteOne({ id });
         if (result.deletedCount === 0) { return handleError(res, null, `${getCurrentDateTime()} - Falha ao eliminar colaborador - Servidor`); }

         // Eliminar departamentos órfãos
         const workerCount = await workCollection.countDocuments({ dep: depName });
         if (workerCount === 0) { await depCollection.deleteOne({ depName }); }

         res.json({ message: `${getCurrentDateTime()} - Colaborador eliminado com sucesso` });
      } catch (error) { handleError(res, error, `${getCurrentDateTime()} - Erro ao eliminar colaborador - Servidor`); }
   });

   return router;
};