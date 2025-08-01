module.exports = (dbCredenciais, dayjs, mongooseConnection) => {
   const express = require('express');
   const router = express.Router();
   const { ObjectId } = require('mongodb');
   const Credential = require('./../schemas/Credentials')(mongooseConnection);
   const handleError = require('../utils/handleError');


   // Middleware para assegurar conexão à DB
   router.use(async (req, res, next) => { next(); });

   // Util para formato data/hora
   function getCurrentDateTime() { return dayjs().format('HH:mm, DD/MM/YYYY'); }


   /**
    * @openapi
    * /cred/login:
    *    post:
    *       summary: Endpoint de serviço de credenciais/autenticação (login)
    *       description: Recebe credenciais de frontend para comparar com dados existentes; retorna nível de acesso
    *       tags:
    *          - Cred
    *       responses:
    *          '200':
    *             description: Sucesso ao autenticar o utilizador - credenciais existem, utilizador tem acesso à aplicação
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
    *          '401':
    *             description: Credenciais inválidas - username e/ou password errados
    *          '403':
    *             description: Utilizador não tem acesso à aplicação
    *          '500':
    *             description: Erro de servidor/API ao buscar data/hora
    */

   router.post('/login', async (req, res) => {
      try {
         const { username, password, appName } = req.body;
         const user = await Credential.findOne({ username });

         if (!user || !user.active) return res.status(401).json({ error: 'Credenciais inválidas' });

         const appAuth = user.auth.find(a => a.authApp === appName);
         if (!appAuth) return res.status(403).json({ error: 'Esta conta de utilizador não tem acesso a esta aplicação. Por favor contacte o administrador.' });

         const appPassExists = appAuth.appPass && appAuth.appPass.trim() !== "";
         const validPassword = appPassExists ? appAuth.appPass : user.userpass;
         if (password !== validPassword) return res.status(401).json({ error: 'Credenciais inválidas' });

         // Opcionalmente, update lastLogin
         user.lastLogin = new Date();
         await user.save();

         res.json({
            name: user.name,
            username: user.username,
            authLvl: appAuth.authLvl
         });
      } catch (error) {
         handleError(res, error, 500, 'Error during login process');
      }
   });

   return router;
};