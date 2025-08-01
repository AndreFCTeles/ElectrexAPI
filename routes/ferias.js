module.exports = (dbJRMFerias) => {
   const express = require('express');
   const { body, validationResult } = require('express-validator');
   const router = express.Router();
   const generateUniqueId = require('../utils/generateUniqueId');
   const handleError = require('../utils/handleError');




   // Middleware para assegurar conexão à DB
   router.use(async (req, res, next) => { next(); });
   //console.log("Router ferias.js inicializado com db:", dbJRMFerias.databaseName);






   /* |----- Função para verificar e atualizar avaDays anualmente -----| */
   async function checkAndUpdateAnnualIncrements() {
      const currentYear = new Date().getFullYear();
      const dbIncrementoAnual = dbJRMFerias.collection('IncrementoAnual');
      const globalSettings = await dbIncrementoAnual.findOne({ _id: "global" });

      if (globalSettings && globalSettings.lastIncrementYear >= currentYear) {
         console.log(`Incremento já foi realizado para ano corrente: ${globalSettings.lastIncrementYear}. A saltar atualização...`);
         return;
      }
      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const workers = await collection.find({}).toArray();
         for (const worker of workers) {
            const days = 22;
            worker.avaDays += days;  // Número de dias a incrementar
            await collection.updateOne({ id: worker.id }, {
               $set: { avaDays: worker.avaDays }
            });
            console.log(`Colaborador ${worker.id} recebeu +${days} para ausências. Dias atuais: ${worker.avaDays}`);
         }
         // Atualizar o último ano em que incremento foi realizado
         await dbIncrementoAnual.updateOne(
            { _id: "global" },
            { $set: { lastIncrementYear: currentYear } }
         );
         console.log(`${workers.length} colaboradores atualizados para o ano ${currentYear}.`);
      } catch (error) { console.error("Erro ao incrementar dias disponíveis: ", error); }
   }

   /* |----- Rota para Forçar a Atualização Anual -----| */
   router.post('/incrementavadays', async (req, res) => {
      console.log("POST request to /incrementavadays");
      try {
         await checkAndUpdateAnnualIncrements();
         res.json({ message: "Incremento anual verificado e aplicado se necessário." });
      } catch (error) {
         res.status(500).json({ message: "Erro ao executar incremento anual", error });
      }
   });






   // |----- ENDPOINTS DE BUSCA -----|

   // API endpoint para receber dados de login - Férias
   router.get('/getloginferias', async (req, res) => {
      try {
         const collection = dbJRMFerias.collection('Credenciais');
         const credentials = await collection.find({}).toArray();
         res.json({ credentials });
      } catch (error) { handleError(res, error, 'Erro ao buscar dados de login - Servidor'); }
   });

   // API endpoint para receber dados de colaboradores e ausências - Férias
   router.get('/getferias', async (req, res) => {
      console.log("GET request para /getferias");
      try {
         console.log("A buscar dados...");
         const collection = dbJRMFerias.collection('Funcionarios');
         const workers = await collection.find({}).toArray();
         //console.log("Data fetched:", workers);
         console.log(`Dados de colaborador buscados com sucesso: ${workers.length}`);
         res.json({ workers });
      } catch (error) { handleError(res, error, 'Erro ao buscar dados - Servidor'); }
   });

   // API endpoint para receber dados de colaboradores e ausências - Férias
   router.get('/getdepartments', async (req, res) => {
      try {
         const depCollection = dbJRMFerias.collection('Departamentos');
         const departments = await depCollection.find({}).toArray();
         res.json({ departments });
      } catch (error) { handleError(res, error, 'Erro ao buscar departamentos'); }
   });

   // |----- ENDPOINTS DE ESCRITA -----|

   // FÉRIAS - EVENTOS
   // API endpoint para escrita de dados de ausência - Férias
   router.post('/postferias', async (req, res) => {
      const { id, absence, type } = req.body;
      if (!id || !absence || !type) { return res.status(400).json({ message: 'Campos obrigatórios em falta - Servidor' }); }
      if (!absence.start || !absence.end) { return res.status(400).json({ message: 'Dados de ausência inválidos - Servidor' }); }

      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const worker = await collection.findOne({ id });
         if (!worker) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }

         if (type === 'vacation') {
            worker.avaDays -= absence.busDays || 0;
            worker.vacations.push(absence);
         } else if (type === 'off-day') {
            if (absence.allDay) { worker.avaDays -= 1; }
            else { worker.compH = (worker.compH || 0) + (absence.absTime || 0); }
            worker.offDays.push(absence);
         } else { return res.status(400).json({ message: 'Tipo inválido - Servidor' }); }

         await collection.updateOne({ id }, { $set: worker });
         res.json({ message: 'Ausência adicionada com sucesso - Servidor' });
      } catch (error) {
         handleError(res, error, 'Erro ao adicionar ausência - Servidor');
      }
   });
   // FÉRIAS - COLABORADOR
   // API endpoint para escrita de dados de colaboradores - Férias
   router.post('/novocolab', async (req, res) => {
      const { title, dep, color, avaDays } = req.body;
      if (!title || !dep) { return res.status(400).json({ message: 'Obrigatório introduzir nome e departamento - Servidor' }); }
      try {
         const workCollection = dbJRMFerias.collection('Funcionarios');
         const depCollection = dbJRMFerias.collection('Departamentos');

         let department = await depCollection.findOne({ depName: dep });
         if (!department) { await depCollection.insertOne({ depName: dep, depDefColor: color }); }

         const worker = await workCollection.find({}).toArray();
         const newWorker = {
            id: generateUniqueId(worker), // Gerar ID único, com base nos colaboradores existentes
            title,
            displayName,
            dep,
            vacations: [],
            offDays: [],
            color,
            avaDays
         };
         await workCollection.insertOne(newWorker);
         res.json({ message: 'Colaborador adicionado com sucesso - Servidor' });
      } catch (error) { handleError(res, error, 'Erro ao adicionar colaborador - Servidor'); }
   });


   // |----- ENDPOINTS DE ATUALIZAÇÃO -----|

   // FÉRIAS - EVENTOS
   // API endpoint para atualizar/editar dados de ausência - Férias
   router.patch('/editferias/:eventId', async (req, res) => {
      const { eventId } = req.params;
      const updates = req.body;
      const [workerId, absenceTypeCode] = eventId.split("-");
      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const worker = await collection.findOne({ id: workerId });
         if (!worker) return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' });
         const currentEventType = absenceTypeCode === '1' ? 'vacations' : 'offDays';
         const newEventType = updates.type === 'vacation' ? 'vacations' : 'offDays';
         const eventList = worker[currentEventType];
         const eventIndex = eventList.findIndex(e => e.id === eventId);
         if (eventIndex === -1) return res.status(404).json({ message: 'Evento não encontrado - Servidor' });
         const oldEvent = eventList[eventIndex];

         // Ajustar avaDays ou compH com base no evento a ser modificado
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

         // Mover evento se o tipo for mudado
         if (currentEventType !== newEventType) {
            worker[currentEventType].splice(eventIndex, 1);
            worker[newEventType].push(updatedEvent);
         } else { worker[currentEventType].splice(eventIndex, 1, updatedEvent); } // Atualizar evento no array

         await collection.updateOne({ id: workerId }, { $set: worker });
         res.json({ message: 'Evento atualizado com sucesso', event: updatedEvent });
      } catch (error) { handleError(res, error, 'Erro ao atualizar dados de evento - Servidor'); }
   });

   // FÉRIAS - COLABORADOR
   // API endpoint para atualizar/editar dados de colaborador - Férias
   router.patch('/editarColab/:id', async (req, res) => {
      const { id } = req.params;
      const updates = req.body;
      try {
         const workCollection = dbJRMFerias.collection('Funcionarios');
         const depCollection = dbJRMFerias.collection('Departamentos');

         // verificar dados de colaborador atuais
         const worker = await workCollection.findOne({ id });
         if (!worker) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }
         const originalDep = worker.dep;

         // update
         const result = await workCollection.updateOne({ id }, { $set: updates });
         if (result.matchedCount === 0) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }

         // se departamento mudou, verificar se departamento é órfão
         if (updates.dep && updates.dep !== originalDep) {
            const remaining = await workCollection.countDocuments({ dep: originalDep }); // contar quantos colaboradores têm o dep
            if (remaining === 0) { await depCollection.deleteOne({ depName: originalDep }); } // eliminar dep órfão
         }

         res.json({ message: 'Colaborador atualizado com sucesso' });
      } catch (error) { handleError(res, error, 'Erro ao atualizar dados de colaborador - Servidor'); }
   });


   // |----- ENDPOINTS DE REMOÇÃO -----|

   // FÉRIAS - EVENTOS
   // API endpoint para eliminar dados de ausência - Férias
   router.delete('/deleteferias/:eventId', async (req, res) => {
      const { eventId } = req.params;
      const [workerId, absenceTypeCode, eventUniqueId] = eventId.split("-");
      try {
         const collection = dbJRMFerias.collection('Funcionarios');
         const worker = await collection.findOne({ id: workerId });
         if (!worker) return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' });
         const eventType = absenceTypeCode === '1' ? 'vacations' : 'offDays';
         const eventList = worker[eventType];
         const eventIndex = eventList.findIndex(e => e.id === eventId);
         if (eventIndex === -1) return res.status(404).json({ message: 'Evento não encontrado - Servidor' });
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
         res.json({ message: 'Evento eliminado com sucesso' });
      } catch (error) { handleError(res, error, 'Erro ao eliminar evento - Servidor'); }
   });

   // FÉRIAS - COLABORADOR
   // API endpoint para eliminar dados de colaborador - Férias
   router.delete('/eliminarColab/:id', async (req, res) => {
      const { id } = req.params;
      try {
         const workCollection = dbJRMFerias.collection('Funcionarios');
         const depCollection = dbJRMFerias.collection('Departamentos');

         const worker = await workCollection.findOne({ id });
         if (!worker) { return res.status(404).json({ message: 'Colaborador não encontrado - Servidor' }); }

         const depName = worker.dep;
         const result = await workCollection.deleteOne({ id });
         if (result.deletedCount === 0) { return res.status(404).json({ message: 'Falha ao eliminar colaborador - Servidor' }); }

         // Eliminar departamento
         const workerCount = await workCollection.countDocuments({ dep: depName });
         if (workerCount === 0) { await depCollection.deleteOne({ depName }); }


         res.json({ message: 'Colaborador eliminado com sucesso' });
      } catch (error) {
         handleError(res, error, 'Erro ao eliminar colaborador - Servidor');
      }
   });

   return router;
};