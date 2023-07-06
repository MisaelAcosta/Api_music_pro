const http = require('http');
const express = require('express');
const path = require('path');
const config = require('config');
const up = require('universal-pattern');

const port = config.get('port');
const app = express();
const server = http.createServer(app);

up(app, {
  swagger: {
    baseDoc: config.get('basePath'),
    host: `${config.get('host')}:${config.get('port')}`,
    folder: path.join(process.cwd(), 'swagger'),
    info: {
      version: 10.0,
      title: 'Ecommerce',
      termsOfService: 'www.domain.com/terms',
      contact: {
        email: 'cesarcasas@bsdsolutions.com.ar',
      },
      license: {
        name: 'Apache',
        url: 'http://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
  },
  compress: true,
  cors: true,
  production: process.env.NODE_ENV === 'production',
  database: {
    uri: config.get('connection.mongodb.uri'),
    name: config.get('connection.mongodb.name'),
  },
  routeController: (req, res, next, props) => next(),
})
  .then((upInstance) => server.listen(port, () => console.info(`listen *:${port}`)))
  .catch(err => console.error('Error initializing ', err));










/*const http = require('http');
const express = require('express');
const mongojs = require('mongojs');

const app = express();
const db = mongojs('mongodb+srv://ecommerce:wilper123@cluster0.vv94uwp.mongodb.net/?retryWrites=true&w=majority', ['categories']);

const server = http.createServer(app);

server.listen(3000, () => console.info('ready on *:3000'));

app.get('/categories', (req, res) => {
  db.categories.find({}, (error, docs) => {
    if (error) {
      return res.status(500).json({ error: error.toString() });
    }

    res.json({
      docs,
    });
  });
});

app.post('/categories', (req, res) => {
    const {
        name,
        description
    } = req.query;

    db.categories.insert({
        name,
        description,
    }, (error, doc) => {
      if (error) {
        return res.status(500).json({ error: error.toString() });
      }
  
      res.json({
        doc,
      });
    });
  });


app.get('/', (req, res) => {
  res.json({ ok: true });
});
*/

