module.exports = (dbCredenciais, dayjs, mongooseConnection) => {
   const express = require('express');
   const router = express.Router();
   const { ObjectId } = require('mongodb');
   const handleError = require('../utils/handleError');
   const getCurrentDateTime = require('../utils/currentTime');
   const Credential = require('./../schemas/Credentials')(mongooseConnection);


   // Middleware para assegurar conexão à DB
   router.use(async (req, res, next) => { next(); });



   // HELPERS
   // Converte objetos Mongoose (Map/lean) para objeto simples e retira appPass
   function sanitizeApps(apps) {
      if (!apps) return {};
      const obj = apps instanceof Map ? Object.fromEntries(apps) : apps;
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
         if (!v || typeof v !== 'object') { out[k] = v; continue; }
         const { appPass, ...rest } = v; // strip secret
         out[k] = rest;
      }
      return out;
   }
   // Nunca mostra passwords ao cliente
   function toSafeUser(u) {
      if (!u) return null;
      const raw = typeof u.toObject === 'function' ? u.toObject() : u;
      const { userpass, ...rest } = raw; // strip global secret
      return { ...rest, apps: sanitizeApps(u.apps) };
   }
   // Guard: must be a valid Mongo ObjectId
   function ensureId(id, res) {
      if (!ObjectId.isValid(id)) {
         res.status(400).json({ error: 'ID inválido' });
         return false;
      }
      return true;
   }
   // Validação de último username a editar dados
   function getActor(req) {
      const hdr = req.headers['x-actor']; // Prefer explicit header from the CredManager frontend
      if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
      if (req.user?.username) return req.user.username; // fallback to req.user (caso auth middleware seja adicionado mais tarde)
      return 'system';
   }



   // -------------------------------------------------------
   // POST /api/auth/login
   // Body: { username, password, appName }
   // Gate: user.active && (global 'superadmin' || apps[appName] exists)
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/login:
    *    post:
    *       summary: Autenticar utilizador (login)
    *       description: Recebe credenciais e valida acesso (global ou por aplicação). Retorna dados seguros do utilizador e nível de acesso.
    *       tags:
    *          - Cred
    *       responses:
    *          '200':
    *             description: Autenticação efetuada com sucesso.
    *             content:
    *                'application/json':
    *                   schema:
    *                      type: object
    *                      properties:
    *                         name:
    *                            type: string
    *                            example: "John Doe"
    *                         username:
    *                            type: string
    *                            example: "jdoe"
    *                         authLvl:
    *                            type: string
    *                            example: "admin"
    *          '400':
    *             description: username e/ou password em falta.
    *          '401':
    *             description: Credenciais inválidas - username e/ou password errados.
    *          '403':
    *             description: Conta inativa/bloqueada ou sem acesso à aplicação.
    *          '500':
    *             description: Erro de servidor/API ao buscar data/hora.
    */
   router.post('/login', async (req, res) => {
      try {
         const { username, password, appName } = req.body || {};
         if (!username || !password || !appName) {
            return res.status(400).json({ error: 'Nome de utilizador/password em falta' });
         }

         const user = await Credential.findOne({ username }).lean();
         if (!user) return res.status(401).json({ error: 'Credenciais inválidas - nome de utilizador.' });
         // Gate: active status
         //if (!(user.active !== false && user.status === 'ativo')) {
         if (user.status !== 'ativo') {
            return res.status(403).json({ error: 'Conta inativa/bloqueada. Contacte o administrador.' });
         }

         // Gate: admin for app or global superadmin
         const isSuper = user.roles === 'superadmin';
         // Per-app entry (works with Map -> becomes plain object under .lean())
         const appEntry = user.apps?.[appName] || null;
         const hasAppAccess = !!appEntry;
         // Access: superadmin OR has this app in apps
         if (!(isSuper || hasAppAccess)) {
            return res.status(403).json({ error: 'Não tem permissão para aceder a esta aplicação. Contacte o administrador.' });
         }

         // Password precedence: appPass (if set & non-empty) → else global userpass
         const appPassRaw = appEntry && typeof appEntry.appPass === 'string' ? appEntry.appPass : null;
         const appPass = appPassRaw && appPassRaw.trim() !== '' ? appPassRaw : null;
         const effectivePassword = appPass ?? (typeof user.userpass === 'string' ? user.userpass : null);
         if (!effectivePassword || password !== effectivePassword) { // TODO: plaintext userpass (replace with hashing later)
            return res.status(401).json({ error: 'Credenciais inválidas - password.' });
         }
         // if (user.userpass !== userpass) { return res.status(401).json({ error: 'Credenciais inválidas' }); }

         // Audit lastLogin
         const ip = req.ip || req.headers['x-forwarded-for'] || null;
         await Credential.updateOne(
            { _id: user._id },
            { $set: { 'audit.lastLogin.at': dayjs().toDate(), 'audit.lastLogin.ip': ip } }
         );

         // Return a safe user (never send userpass/appPass)
         const { userpass, ...safe } = user;
         if (safe.apps) {
            const appsSafe = {}; // ensure appPass is not leaked
            for (const [k, v] of Object.entries(safe.apps)) {
               const { appPass, ...rest } = v;
               appsSafe[k] = rest;
            }
            safe.apps = appsSafe;
         }
         return res.json({ user: toSafeUser(user) });
      } catch (err) {
         return handleError(res, err, 'Erro no processo de login');
      }
   });






   // -------------------------------------------------------
   // GET /api/auth/listusers  (list with filters/pagination)
   // Query: q (search by nome/username/email), status, active, limit, skip
   // -------------------------------------------------------
   /**
   @openapi
    * /auth/listusers:
    *    get:
    *       summary: Listar utilizadores (com filtros/paginação)
    *       description: Obtém lista de utilizadores - permite pesquisar por nome, username ou email e aplicar filtros de estado/ativo.
    *       tags: [Cred]
    *       parameters:
    *          - in: query
    *            name: q
    *            schema: { type: string }
    *            description: Procura nome/username/email
    *          - in: query
    *            name: status
    *            schema: { type: string, enum: [ativo, inativo, bloqueado] }
    *          - in: query
    *            name: active
    *            schema: { type: boolean }
    *          - in: query
    *            name: limit
    *            schema: { type: integer, default: 100, minimum: 1, maximum: 500 }
    *          - in: query
    *            name: skip
    *            schema: { type: integer, default: 0, minimum: 0 }
    *       responses:
    *          '200':
    *             description: Lista de utilizadores obtida com sucesso
    *             content:
    *                application/json:
    *                   schema:
    *                      type: object
    *                      properties:
    *                         total: { type: integer }
    *                         items:
    *                            type: array
    *                            items: { $ref: '#/components/schemas/SafeCredential' }
    *          '400':
    *             description: Parâmetros de pesquisa inválidos
    *          '500':
    *             description: Erro interno do servidor ao listar utilizadores
    */
   router.get('/listusers', async (req, res) => {
      try {
         const { q, status, active, limit = 100, skip = 0 } = req.query;
         const where = {};
         if (q) {
            where.$or = [
               { nome: { $regex: q, $options: 'i' } },
               { username: { $regex: q, $options: 'i' } },
               { email: { $regex: q, $options: 'i' } },
            ];
         }
         if (status) where.status = status;
         if (typeof active !== 'undefined') where.active = active === 'true';

         const [items, total] = await Promise.all([
            Credential.find(where).sort({ username: 1 }).skip(+skip).limit(+limit).lean(),
            Credential.countDocuments(where)
         ]);

         res.json({ total, items: items.map(toSafeUser) });
      } catch (err) {
         return handleError(res, err, 'Erro ao listar utilizadores');
      }
   });






   // -------------------------------------------------------
   // GET /api/auth/getuser/:id
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/getuser/{id}:
    *    get:
    *       summary: Obter utilizador por ID
    *       description: Devolve um único utilizador com base no seu ID.
    *       tags: [Cred]
    *       parameters:
    *          - in: path
    *            name: id
    *            required: true
    *            schema: { type: string }
    *       responses:
    *          '200':
    *             description: Utilizador encontrado com sucesso
    *             content:
    *                application/json:
    *                   schema:
    *                      type: object
    *                      properties:
    *                         item: { $ref: '#/components/schemas/SafeCredential' }
    *          '404':
    *             description: Utilizador não encontrado
    *          '500':
    *             description: Erro interno do servidor ao obter utilizador
    */
   router.get('/getuser/:id', async (req, res) => {
      try {
         const { id } = req.params;
         if (!ensureId(id, res)) return;
         const user = await Credential.findById(id).lean();
         if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });
         res.json({ item: toSafeUser(user) });
      } catch (err) {
         return handleError(res, err, 'Erro ao obter utilizador');
      }
   });





   // -------------------------------------------------------
   // GET /api/auth/apps → { apps: string[] }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/apps:
    *    get:
    *       summary: Listar aplicações registadas
    *       description: Devolve todos os nomes de aplicações existentes nas credenciais de utilizadores.
    *       tags: [Cred]
    *       responses:
    *          '200':
    *             description: Lista de aplicações obtida com sucesso
    *             content:
    *                application/json:
    *                   schema:
    *                      type: object
    *                      properties:
    *                         apps:
    *                            type: array
    *                            items: { type: string }
    *          '500':
    *             description: Erro interno do servidor ao listar aplicações
    */
   router.get('/apps', async (_req, res) => {
      try {
         const rows = await Credential.aggregate([
            { $project: { appsArray: { $objectToArray: '$apps' } } },
            { $unwind: { path: '$appsArray', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$appsArray.k' } },
            { $project: { _id: 0, name: '$_id' } },
            { $sort: { name: 1 } },
         ]);
         res.json({ apps: rows.map(r => r.name) });
      } catch (err) {
         return handleError(res, err, 'Erro ao listar aplicações');
      }
   });






   // -------------------------------------------------------
   // POST /api/auth/createuser  (create)
   // Body: { nome, username, userpass, email?, active?, status?, roles?, apps? }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/createuser:
    *   post:
    *     summary: Criar um novo utilizador
    *     description: Cria um utilizador. Se `status` for definido para `ativo`, o campo `active` ficará **true** (lógica aplicada no servidor).
    *     tags: [Cred]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateUserInput'
    *     responses:
    *       201:
    *         description: Utilizador criado
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 item: { $ref: '#/components/schemas/SafeCredential' }
    *       400: { description: Campos obrigatórios em falta (ex.: nome ou username) }
    *       409: { description: Conflito/Duplicado (ex.: username já existente) }
    *       500: { description: Erro ao criar utilizador }
    */
   router.post('/createuser', async (req, res) => {
      try {
         //const { nome, username, userpass, email, active, status, roles, apps } = req.body || {};
         const { nome, username, userpass, email, status = 'ativo', roles = null, apps = {} } = req.body || {};
         if (!nome || !username) {
            return res.status(400).json({ error: 'Campos obrigatórios em falta' });
         };

         const actor = getActor(req);

         //Normalize app for payload
         const appsNormalized = {};
         for (const [k, v] of Object.entries(apps || {})) {
            /*
            appsNormalized[k] = {
               roles: Array.isArray(v.roles) && v.roles.length ? v.roles : ['user'],
               appPass: typeof v.appPass === 'string' ? v.appPass : null,
               audit: v.audit || { created: { at: dayjs().toDate(), by: req.user?.username || 'system' }, updated: null }
            };
            */
            const role = typeof v.roles === 'string'
               ? v.roles
               : (Array.isArray(v.roles) && v.roles.length ? v.roles[0] : 'user');
            appsNormalized[k] = {
               roles: role,
               appPass: typeof v.appPass === 'string' ? v.appPass : null,
               audit: v.audit || {
                  created: {
                     at: dayjs().toDate(),
                     by: actor || 'system'
                  },
                  updated: null
               }
            };
         }

         // Create
         const now = dayjs().toDate();
         const doc = await Credential.create({
            nome,
            username,
            userpass,
            email: email ?? null,
            active: status === 'ativo',
            status,
            roles,
            passwordUpdatedAt: now,
            apps: appsNormalized,
            audit: {
               created: {
                  at: now,
                  by: actor || 'system'
               }
            }
         });

         res.status(201).json({ item: toSafeUser(doc) });
      } catch (err) {
         return handleError(res, err, 'Falha ao criar utilizador');
      }
   });






   // -------------------------------------------------------
   // PATCH /api/auth/updateuser/:id  (general updates, no roles/apps)
   // Body: { nome?, username?, email?, active?, status? , role? }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/updateuser/{id}:
    *   patch:
    *     summary: Atualizar dados gerais do utilizador
    *     description: Atualiza campos gerais (`nome`, `username`, `email`, `status`, `roles`). Se `status` mudar para `ativo`, o campo `active` é atualizado automaticamente para **true**.
    *     tags: [Cred]
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
    *               nome: { type: string }
    *               username: { type: string }
    *               email: { type: string, nullable: true }
    *               status: { type: string, enum: [ativo, inativo, bloqueado] }
    *               roles: { type: string, description: Papel global (ex.: "user" | "admin" | "superadmin") }
    *     responses:
    *       200:
    *         description: Utilizador atualizado
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 item: { $ref: '#/components/schemas/SafeCredential' }
    *       400: { description: ID inválido }
    *       404: { description: Utilizador não encontrado }
    *       500: { description: Erro ao atualizar utilizador }
    */
   router.patch('/updateuser/:id', async (req, res) => {
      try {
         const { id } = req.params;
         if (!ensureId(id, res)) return;

         const { nome, username, email, status, roles } = req.body || {};
         const set = {};
         const actor = getActor(req);

         if (typeof nome !== 'undefined') set.nome = nome;
         if (typeof username !== 'undefined') set.username = username;
         if (typeof email !== 'undefined') set.email = email ?? null;
         //if (typeof active !== 'undefined') set.active = !!active;
         if (typeof status !== 'undefined') {
            set.status = status;
            set.active = (status === 'ativo');
         }
         if (typeof roles === 'string') set.roles = roles;

         // audit
         set['audit.updated.at'] = dayjs().toDate();
         set['audit.updated.by'] = actor || 'system';

         const doc = await Credential.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true, lean: true });
         if (!doc) return res.status(404).json({ error: 'Utilizador não encontrado' });
         res.json({ item: toSafeUser(doc) });
      } catch (err) {
         return handleError(res, err, 'Falha ao atualizar utilizador');
      }
   });







   // -------------------------------------------------------
   // PATCH /api/auth/users/:id/password
   // Body:
   //   { scope: 'global', newPassword?: string|null }
   //   { scope: 'app', appName: string, newPassword?: string|null }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/updateuser/{id}/password:
    *   patch:
    *     summary: Atualizar password (global ou por aplicação)
    *     description: Permite definir/remover password global (`scope = global`) ou password específica de aplicação (`scope = app` + `appName`).
    *     tags: [Cred]
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
    *             required: [scope]
    *             properties:
    *               scope: { type: string, enum: [global, app] }
    *               appName: { type: string, description: Necessário quando `scope = app` }
    *               newPassword: { type: string, nullable: true, description: Se `null` ou vazio, remove a password nesse âmbito }
    *     responses:
    *       200: { description: Password atualizada }
    *       400: { description: Parâmetros em falta/invalidos }
    *       404: { description: Utilizador não encontrado }
    *       500: { description: Erro ao atualizar password }
    */
   router.patch('/updateuser/:id/password', async (req, res) => {
      try {
         const { id } = req.params;
         if (!ensureId(id, res)) return;

         const { scope, appName, newPassword } = req.body || {};
         const actor = getActor(req);
         if (!scope || (scope === 'app' && !appName)) {
            return res.status(400).json({ error: 'Parâmetros em falta' });
         }

         if (scope === 'global') {
            const set = {
               userpass: (typeof newPassword === 'string' && newPassword.trim() !== '') ? newPassword : null,
               passwordUpdatedAt: dayjs().toDate(),
               'audit.updated.at': dayjs().toDate(),
               'audit.updated.by': actor || 'system',
            };
            const doc = await Credential.findByIdAndUpdate(id, { $set: set }, { new: true, lean: true });
            if (!doc) return res.status(404).json({ error: 'Utilizador não encontrado' });
            return res.json({ item: toSafeUser(doc) });
         }

         // scope === 'app'
         const pathBase = `apps.${appName}`;
         const now = dayjs().toDate();

         // ensure app entry exists
         const existing = await Credential.findById(id).select({ [pathBase]: 1 }).lean();
         if (!existing?.apps || !existing.apps[appName]) {
            await Credential.updateOne(
               { _id: id },
               {
                  $set: {
                     [pathBase]: {
                        roles: 'user',
                        appPass: null,
                        audit: {
                           created: {
                              at: now,
                              by: actor || 'system'
                           },
                           updated: null
                        }
                     }
                  }
               }
            );
         }

         const set = {
            [`${pathBase}.appPass`]: (typeof newPassword === 'string' && newPassword.trim() !== '') ? newPassword : null,
            [`${pathBase}.audit.updated.at`]: now,
            [`${pathBase}.audit.updated.by`]: actor || 'system',
            'audit.updated.at': now,
            'audit.updated.by': actor || 'system',
         };

         const doc = await Credential.findByIdAndUpdate(id, { $set: set }, { new: true, lean: true });
         if (!doc) return res.status(404).json({ error: 'Utilizador não encontrado' });
         return res.json({ item: toSafeUser(doc) });
      } catch (err) {
         return handleError(res, err, 'Falha ao alterar password');
      }
   });








   // -------------------------------------------------------
   // PATCH /api/auth/updateuser/:id/role { role: 'admin' }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/updateuser/{id}/role:
    *   patch:
    *     summary: Atualizar papel global (role) do utilizador
    *     description: Define o papel global do utilizador (por exemplo, `user`, `admin` ou `superadmin`).
    *     tags: [Cred]
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
    *             required: [role]
    *             properties:
    *               role: { type: string }
    *     responses:
    *       200: { description: Papel global atualizado }
    *       400: { description: ID inválido ou corpo inválido }
    *       404: { description: Utilizador não encontrado }
    *       500: { description: Erro ao atualizar papel }
    */
   router.patch('/updateuser/:id/role', async (req, res) => {
      const { id } = req.params, { role } = req.body || {};
      const actor = getActor(req);
      if (!ensureId(id, res)) return;
      if (!role) return res.status(400).json({ error: 'Role em falta' });
      const doc = await Credential.findByIdAndUpdate(id,
         { $set: { roles: role, 'audit.updated.at': dayjs().toDate(), 'audit.updated.by': actor || 'system' } },
         { new: true, lean: true });
      if (!doc) return res.status(404).json({ error: 'Utilizador não encontrado' });
      res.json({ item: toSafeUser(doc) });
   });








   // -------------------------------------------------------
   // PATCH /api/auth/updateuser/:id/apps/:app/role { role: 'editor' }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/updateuser/{id}/apps/{app}/role:
    *   patch:
    *     summary: Atualizar papel de uma aplicação para o utilizador
    *     description: Define o papel associado a uma aplicação específica no objeto `apps` do utilizador.
    *     tags: [Cred]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *       - in: path
    *         name: app
    *         required: true
    *         schema: { type: string }
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [role]
    *             properties:
    *               role: { type: string }
    *     responses:
    *       200:
    *         description: Papel da aplicação atualizado
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 item: { $ref: '#/components/schemas/SafeCredential' }
    *       400: { description: ID inválido ou parâmetros em falta }
    *       404: { description: Utilizador ou aplicação não encontrados }
    *       500: { description: Erro ao atualizar papel da aplicação }
    */
   router.patch('/updateuser/:id/apps/:app/role', async (req, res) => {
      const { id, app } = req.params, { role } = req.body || {};
      if (!ensureId(id, res)) return;
      if (!role) return res.status(400).json({ error: 'Role em falta' });
      const actor = getActor(req);
      const base = `apps.${app}`;
      const now = dayjs().toDate();
      await Credential.updateOne(
         { _id: id },
         {
            $set: {
               [`${base}.roles`]: role,
               [`${base}.audit.updated.at`]: now,
               [`${base}.audit.updated.by`]: actor || 'system',
               'audit.updated.at': now,
               'audit.updated.by': actor || 'system',
            },
            $setOnInsert: {
               [`${base}.appPass`]: null,
               [`${base}.audit.created`]: { at: now, by: actor || 'system' },
            },
         },
         { upsert: true }
      );
      const doc = await Credential.findById(id).lean();
      if (!doc) return res.status(404).json({ error: 'Utilizador não encontrado' });
      res.json({ item: toSafeUser(doc) });
   });






   // -------------------------------------------------------
   // PATCH /api/auth/updateuserstatus/:id/status
   // Body: { active?: boolean, status?: 'active'|'disabled'|'locked' }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/updateuser/{id}/apps/{app}:
    *   delete:
    *     summary: Remover aplicação das credenciais do utilizador
    *     description: Elimina a entrada `apps.{app}` do utilizador indicado.
    *     tags: [Cred]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *       - in: path
    *         name: app
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200:
    *         description: Aplicação removida
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 item: { $ref: '#/components/schemas/SafeCredential' }
    *       400: { description: ID inválido }
    *       404: { description: Utilizador ou aplicação não encontrados }
    *       500: { description: Erro ao remover aplicação }
    */
   router.patch('/updateuserstatus/:id/status', async (req, res) => {
      try {
         const { id } = req.params;
         if (!ensureId(id, res)) return;
         const set = {};
         const actor = getActor(req);

         if (typeof req.body?.status !== 'undefined') {
            set.status = req.body.status;
            set.active = (req.body.status === 'ativo');
         }
         set['audit.updated.at'] = dayjs().toDate();
         set['audit.updated.by'] = actor || 'system';

         const doc = await Credential.findByIdAndUpdate(id, { $set: set }, { new: true, lean: true, runValidators: true });
         if (!doc) return res.status(404).json({ error: 'Utilizador não encontrado' });
         res.json({ item: toSafeUser(doc) });
      } catch (err) {
         return handleError(res, err, 'Falha ao atualizar estado do utilizador');
      }
   });







   // -------------------------------------------------------
   // DELETE /api/auth/deleteuser/:id
   // Body: { active?: boolean, status?: 'active'|'disabled'|'locked' }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/deleteuser/{id}:
    *   delete:
    *     summary: Eliminar utilizador por ID
    *     description: Remove definitivamente o utilizador indicado pelo seu identificador.
    *     tags: [Cred]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200:
    *         description: Utilizador eliminado
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 deletedCount: { type: integer }
    *                 id: { type: string }
    *       400: { description: ID inválido }
    *       404: { description: Utilizador não encontrado }
    *       500: { description: Erro ao eliminar utilizador }
    */
   router.delete('/deleteuser/:id', async (req, res) => {
      try {
         const { id } = req.params;
         if (!ensureId(id, res)) return;

         const out = await Credential.deleteOne({ _id: new ObjectId(id) });
         if (out.deletedCount === 0) return res.status(404).json({ error: 'Utilizador não encontrado' });
         return res.json({ deletedCount: out.deletedCount, id });
      } catch (err) {
         return handleError(res, err, 'Falha ao eliminar utilizador');
      }
   });






   // -------------------------------------------------------
   // DELETE /api/auth/users
   // Body: { ids: string[] }
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/deleteusers:
    *   delete:
    *     summary: Eliminar vários utilizadores (bulk)
    *     description: Elimina em lote os utilizadores cujos IDs são fornecidos no corpo do pedido.
    *     tags: [Cred]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [ids]
    *             properties:
    *               ids:
    *                 type: array
    *                 items: { type: string }
    *     responses:
    *       200:
    *         description: Resultado da eliminação em lote
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 deletedCount: { type: integer }
    *                 ids:
    *                   type: array
    *                   items: { type: string }
    *       400: { description: Corpo inválido ou lista de IDs em falta }
    *       500: { description: Erro ao eliminar utilizadores }
    */
   router.delete('/deleteusers', async (req, res) => {
      try {
         const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
         if (!ids.length) return res.status(400).json({ error: 'Nada para eliminar' });

         const objectIds = [];
         for (const id of ids) {
            if (ObjectId.isValid(id)) objectIds.push(new ObjectId(id));
         }
         if (!objectIds.length) return res.status(400).json({ error: 'IDs inválidos' });

         const out = await Credential.deleteMany({ _id: { $in: objectIds } });
         return res.json({ requested: ids.length, deletedCount: out.deletedCount });
      } catch (err) {
         return handleError(res, err, 'Falha ao eliminar utilizadores');
      }
   });




   // -------------------------------------------------------
   // DELETE /api/auth/updateuser/:id/apps/:app
   // -------------------------------------------------------
   /**
    * @openapi
    * /auth/updateuser/{id}/apps/{app}:
    *   delete:
    *     summary: Remove an app entry from a user
    *     tags: [Cred]
    *     parameters:
    *       - in: path
    *         name: id
    *         required: true
    *         schema: { type: string }
    *       - in: path
    *         name: app
    *         required: true
    *         schema: { type: string }
    *     responses:
    *       200:
    *         description: Updated user (app removed)
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 item: { $ref: '#/components/schemas/SafeCredential' }
    *       404: { description: Not found }
    */
   router.delete('/updateuser/:id/apps/:app', async (req, res) => {
      try {
         const { id, app } = req.params;
         if (!ensureId(id, res)) return;
         const actor = getActor(req);
         const path = `apps.${app}`;
         const out = await Credential.updateOne(
            { _id: id, [path]: { $exists: true } },
            { $unset: { [path]: "" }, $set: { 'audit.updated.at': dayjs().toDate(), 'audit.updated.by': actor || 'system' } }
         );
         if (!out.matchedCount) return res.status(404).json({ error: 'Utilizador ou aplicação não encontrados' });
         const doc = await Credential.findById(id).lean();
         return res.json({ item: toSafeUser(doc) });
      } catch (err) {
         return handleError(res, err, 'Falha ao remover aplicação do utilizador');
      }
   });





   return router;
};