// swagger/swaggerOptions.js
export const swaggerOptions = {
   definition: {
      openapi: '3.0.0',
      info: {
         title: 'My MERN API',
         version: '1.0.0',
         description: 'API documentation for my custom MERN stack backend',
      },
      servers: [
         {
            url: 'http://192.168.0.12:8080/api', // adapt to your backend base path
         },
      ],
   },
   apis: ['./routes/*.js'], // where your JSDoc comments are
};