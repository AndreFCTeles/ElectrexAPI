module.exports = (dbCredenciais) => {
   const express = require('express');
   const router = express.Router();
   const handleError = require('../utils/handleError');

   // Middleware para assegurar conexão à DB
   router.use(async (req, res, next) => { next(); });

   router.post('/login', async (req, res) => {
      const { username, password, appName } = req.body;
      const user = await dbCredenciais.collection('Credentials').findOne({ username });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      if (password !== user.userpass) return res.status(401).json({ error: 'Invalid credentials' });

      const appAuth = user.auth.find(a => a.authApp === appName);

      if (!appAuth) return res.status(403).json({ error: 'No access to this application' });
      res.json({ username, authLvl: appAuth.authLvl });
   });


   return router;
};