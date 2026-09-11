import { Router, Request, Response } from 'express';

export const docsRouter = Router();

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Modular Mobile ERP - Desktop API',
    version: '2.0.0',
    description: 'Enterprise REST APIs for Repair Workshops, Retail POS, Spare Parts Wholesale, E-Wallets/Fintech, Accounting & General Ledger, and Multi-Warehouse Inventory.'
  },
  servers: [
    { url: 'http://localhost:5000/api', description: 'Local Desktop ERP Server' }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key'
      }
    }
  },
  security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
  paths: {
    '/health': {
      get: { summary: 'System Health & Metrics', responses: { 200: { description: 'Server online' } } }
    },
    '/auth/login': {
      post: { summary: 'Authenticate User & Issue JWT', responses: { 200: { description: 'Token issued' } } }
    },
    '/accounting/accounts': {
      get: { summary: 'Get Chart of Accounts', responses: { 200: { description: 'Account list' } } },
      post: { summary: 'Create New Account', responses: { 201: { description: 'Account created' } } }
    },
    '/accounting/journal-entries': {
      get: { summary: 'Get Journal Entries', responses: { 200: { description: 'Journal entries with lines' } } },
      post: { summary: 'Post Balanced Double-Entry Journal Entry', responses: { 201: { description: 'Posted' } } }
    },
    '/inventory/warehouses': {
      get: { summary: 'List Warehouses', responses: { 200: { description: 'Warehouses list' } } }
    },
    '/inventory/transfers': {
      get: { summary: 'List Stock Transfers', responses: { 200: { description: 'Transfers' } } },
      post: { summary: 'Execute Inter-Warehouse Stock Transfer', responses: { 201: { description: 'Transfer executed' } } }
    },
    '/repair/tickets': {
      get: { summary: 'List Repair Tickets with SLA status', responses: { 200: { description: 'Tickets list' } } }
    },
    '/retail/sales': {
      get: { summary: 'List Completed Sales Invoices', responses: { 200: { description: 'Sales list' } } }
    },
    '/fintech/wallets': {
      get: { summary: 'List E-Wallets & Threshold Lock Status', responses: { 200: { description: 'Wallets list' } } }
    },
    '/search/global': {
      get: { summary: 'Universal Global Search (Customers, Items, Tickets, IMEIs)', responses: { 200: { description: 'Search results' } } }
    }
  }
};

docsRouter.get('/openapi.json', (req: Request, res: Response) => {
  res.json(openApiSpec);
});

docsRouter.get('/', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Swagger UI - Modular Mobile ERP</title>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
      <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #0b0f19; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
      <script>
      window.onload = function() {
        SwaggerUIBundle({
          url: "/api/docs/openapi.json",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          layout: "StandaloneLayout"
        });
      };
      </script>
    </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});
