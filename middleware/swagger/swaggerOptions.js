// import swaggerJsdoc from 'swagger-jsdoc'; // ES Module syntax (if you use import/export)
const swaggerJsdoc = require('swagger-jsdoc');

// swagger/swaggerOptions.js
const swaggerOptions = {
   definition: {
      openapi: '3.1.0',
      info: {
         title: 'João R. Matos - API',
         version: '1.1.0',
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
      components: {
         // If you add auth later, keep this — otherwise you can remove it.
         /*
         securitySchemes: {
            bearerAuth: {
               type: 'http',
               scheme: 'bearer',
               bearerFormat: 'JWT',
            },
         },
         */

         responses: {
            NotFound: {
               description: 'Not found',
               content: {
                  'application/json': {
                     schema: {
                        type: 'object',
                        properties: { error: { type: 'string', example: 'Recurso não encontrado' } },
                     },
                  },
               },
            },
            BadRequest: {
               description: 'Validation or input error',
               content: {
                  'application/json': {
                     schema: {
                        type: 'object',
                        properties: {
                           error: { type: 'string', example: 'Dados inválidos' },
                           details: { type: 'string', nullable: true },
                        },
                     },
                  },
               },
            },
            ServerError: {
               description: 'Server error',
               content: {
                  'application/json': {
                     schema: {
                        type: 'object',
                        properties: {
                           error: { type: 'string', example: 'Erro interno do servidor' },
                           code: { type: 'string', nullable: true },
                        },
                     },
                  },
               },
            },
         },

         // Use these with $ref: '#/components/parameters/...'
         parameters: {
            IdPathParam: {
               in: 'path',
               name: 'id',
               required: true,
               schema: { type: 'string' },
               description: 'MongoDB document ID',
            },
         },

         // Reusable object models. Keep them coarse at first; refine later.
         schemas: {
            AppAudit: {
               type: 'object',
               properties: {
                  created: {
                     type: 'object',
                     properties: {
                        at: { type: 'string', format: 'date-time' },
                        by: { type: 'string' }, // CMUser (admin username)
                     },
                  },
                  updated: {
                     type: 'object',
                     nullable: true,
                     properties: {
                        at: { type: 'string', format: 'date-time' },
                        by: { type: 'string' },
                     },
                  },
               },
            },

            AppEntry: {
               type: 'object',
               properties: {
                  roles: { type: 'string', example: 'user' }, // change to array if you adopt multiple roles
                  appPass: { type: 'string', nullable: true }, // redacted in responses if you prefer
                  audit: { $ref: '#/components/schemas/AppAudit' },
               },
            },

            SafeCredential: {
               type: 'object',
               properties: {
                  _id: { type: 'string' },
                  nome: { type: 'string' },
                  username: { type: 'string' },
                  email: { type: 'string', nullable: true },
                  status: { type: 'string', example: 'ativo', enum: ['ativo', 'inativo', 'bloqueado'] },
                  active: { type: 'boolean' },
                  roles: { type: 'string', example: 'user' },
                  apps: {
                     type: 'object',
                     additionalProperties: { $ref: '#/components/schemas/AppEntry' },
                  },
                  audit: { $ref: '#/components/schemas/AppAudit' },
               },
            },

            CreateUserInput: {
               type: 'object',
               required: ['nome', 'username'],
               properties: {
                  nome: { type: 'string' },
                  username: { type: 'string' },
                  userpass: { type: 'string', nullable: true },
                  email: { type: 'string', nullable: true },
                  active: { type: 'boolean', default: true },
                  status: { type: 'string', example: 'ativo', enum: ['ativo', 'inativo', 'bloqueado'] },
                  roles: { type: 'string', example: 'user' },
                  apps: {
                     type: 'object',
                     additionalProperties: {
                        type: 'object',
                        properties: {
                           roles: { type: 'string', example: 'user' },
                           appPass: { type: 'string', nullable: true },
                        },
                     },
                  },
               },
            },

            UpdateUserInput: {
               type: 'object',
               properties: {
                  nome: { type: 'string' },
                  username: { type: 'string' },
                  email: { type: 'string', nullable: true },
                  active: { type: 'boolean' },
                  status: { type: 'string', enum: ['ativo', 'inativo', 'bloqueado'] },
                  roles: { type: 'string' },
                  apps: { type: 'object' }, // optional: allow bulk apps updates
               },
            },

            UpdateGlobalPasswordInput: {
               type: 'object',
               required: ['scope'],
               properties: {
                  scope: { type: 'string', enum: ['global'] },
                  newPassword: { type: 'string', nullable: true },
               },
            },

            UpdateAppPasswordInput: {
               type: 'object',
               required: ['scope', 'appName'],
               properties: {
                  scope: { type: 'string', enum: ['app'] },
                  appName: { type: 'string' },
                  newPassword: { type: 'string', nullable: true },
               },
            },

            Category: {
               type: 'object',
               properties: {
                  label: { type: 'string' },
                  value: { type: 'string' }, // auto-derived server-side for quick-add; optional on create
                  technical: { type: 'array', items: { type: 'string' } },
                  format: { type: 'array', items: { type: 'string' } },
                  subCategories: { type: 'array', items: { $ref: '#/components/schemas/Category' } },
               },
            },

            Product: {
               type: 'object',
               properties: {
                  prodName: { type: 'string' },
                  brand: { type: 'string' },
                  series: { type: 'string' },
                  category: { type: 'object' }, // your custom shape (ProdCategory); can be refined later
                  format: { type: 'array', items: { type: 'string' } },
                  technical: { type: 'array', items: { type: 'object' } }, // TechnicalData[]
                  description: { type: 'string' },
                  applications: { type: 'string' },
                  functions: { type: 'array', items: { type: 'string' } },
                  images: { type: 'array', items: { type: 'object' } },
                  createdDate: { type: 'string', format: 'date-time' },
                  updatedDate: { type: 'string', format: 'date-time' },
               },
            },

            AbsenceInput: {
               type: 'object',
               properties: {
                  id: { type: 'string', description: 'event ID (if client-generated)' },
                  start: { type: 'string' }, // ISO, date, or date-time — your code accepts both
                  end: { type: 'string' },
                  allDay: { type: 'boolean' },
                  busDays: { type: 'number', description: 'Business days count' },
                  absTime: { type: 'number', description: 'Hours/minutes as decimal' },
                  lunch: { type: 'boolean' },
               },
            },

            EditAbsenceInput: {
               allOf: [{ $ref: '#/components/schemas/AbsenceInput' }],
               properties: {
                  type: { type: 'string', enum: ['vacation', 'off-day'] },
               },
            },

            WorkerUpdate: {
               type: 'object',
               properties: {
                  title: { type: 'string' },
                  displayName: { type: 'string' },
                  dep: { type: 'string' },
                  color: { type: 'string' },
                  avaDays: { type: 'integer' },
               },
            },
         },
      },
   },

   apis: ['server.js', './routes/*.js'], // where your JSDoc comments are
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// ES Module syntax (if you use import/export)
// export default swaggerSpec;

// If you use require syntax (CommonJS), use:
module.exports = swaggerSpec;