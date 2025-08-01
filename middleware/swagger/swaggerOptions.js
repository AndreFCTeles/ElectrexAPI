// import swaggerJsdoc from 'swagger-jsdoc'; // ES Module syntax (if you use import/export)
const swaggerJsdoc = require('swagger-jsdoc');

// swagger/swaggerOptions.js
const swaggerOptions = {
   definition: {
      openapi: '3.1.0',
      info: {
         title: 'João R. Matos - API',
         version: '1.0.0',
         description: 'Documentação para a API que serve as diferentes aplicações Electrex',
      },
      tags: [
         { name: 'Geral', description: 'Endpoints gerais' },
         { name: 'Cred', description: 'Endpoints para credenciais/autenticação' },
         { name: 'Ferias', description: 'Endpoints para aplicação JRMFérias' },
         { name: 'Plan', description: 'Endpoints para aplicação PlanGest v2' },
         { name: 'Repair', description: 'Endpoints para aplicação RepairGest v2' },
         { name: 'EPM', description: 'Endpoints para aplicação ElectrexProductManager' },
      ],
      servers: [
         {
            url: 'http://192.168.0.12:8080/api',
         },
      ],
   },
   apis: ['server.js', './routes/*.js'], // where your JSDoc comments are
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// ES Module syntax (if you use import/export)
// export default swaggerSpec;

// If you use require syntax (CommonJS), use:
module.exports = swaggerSpec;