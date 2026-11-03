'use strict';

/**
 * JOGO DO GALO ONLINE — servidor principal.
 * Express (site + API) · Socket.IO (tempo real + sinalização WebRTC) · PostgreSQL/SQLite
 */

require('./server/env').load();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const logger = require('./server/logger');
const { securityHeaders, rateLimitMiddleware } = require('./server/security');
const { Database } = require('./server/database');
const { Settings } = require('./server/settings');
const { RoomManager, registerRoomHandlers } = require('./server/rooms');
const { registerSignaling } = require('./server/webrtc');
const { createAdminRouter } = require('./server/admin');

async function start({ port = process.env.PORT || 3000, listen = true } = {}) {
  const startedAt = Date.now();
  const db = await Database.connect();
  const settings = await new Settings(db).load();
  const manager = new RoomManager({ db, settings });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  const server = http.createServer(app);
  const io = new Server(server, {
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 200_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: true },
  });
  manager.attach(io);

  app.use(securityHeaders);
  app.use((req, res, next) => {
    if (process.env.FORCE_HTTPS === 'true' && req.get('x-forwarded-proto') === 'http') return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
    next();
  });

  app.get('/healthz', async (req, res) => {
    try {
      await db.one('SELECT 1 AS ok');
      res.json({ ok: true, database: db.kind, uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ ok: false, error: 'DATABASE_UNAVAILABLE' });
    }
  });

  app.use('/api/admin', createAdminRouter({ db, manager, settings, io, startedAt }));
  app.use('/api', rateLimitMiddleware({ windowMs: 60_000, max: 120 }));
  app.all(['/api/rooms', '/api/rooms/*', '/api/salas', '/api/salas/*', '/api/create-room'], (req, res) => {
    logger.warn(`Pedido recusado a rota de salas fora do painel: ${req.method} ${req.originalUrl} [${req.ip}]`);
    res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Apenas o administrador pode criar salas.' });
  });

  app.use(
    express.static(path.join(__dirname, 'public'), {
      extensions: ['html'],
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      setHeaders(res, file) {
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get(['/sala/:code', '/convite/:code'], (req, res) => res.redirect(302, `/?sala=${encodeURIComponent(req.params.code)}`));
  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));
  app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ ok: false, error: 'BAD_REQUEST' });
    logger.error(`Erro em ${req.method} ${req.originalUrl}: ${err.message}`, { error: err.stack });
    res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'Ocorreu um erro inesperado.' });
  });

  registerRoomHandlers(io, manager);
  registerSignaling(io, manager);
  io.engine.on('connection_error', (err) => logger.warn(`Erro de ligação Socket.IO: ${err.message}`));

  if (listen) {
    await new Promise((r) => server.listen(port, r));
    logger.info(`Jogo da Glória Online a funcionar na porta ${server.address().port} (base de dados ${db.kind})`);
  }

  async function close() {
    io.close();
    await new Promise((r) => server.close(() => r()));
    await db.close();
  }
  return { app, server, io, db, manager, settings, close };
}

if (require.main === module) {
  start()
    .then((ctx) => {
      const stop = (sig) => {
        logger.info(`Sinal ${sig} recebido. A encerrar…`);
        ctx.io.emit('server:restarting', { message: 'O servidor vai reiniciar. A ligação volta automaticamente.' });
        ctx.close().finally(() => process.exit(0));
        setTimeout(() => process.exit(0), 6000).unref();
      };
      process.on('SIGTERM', () => stop('SIGTERM'));
      process.on('SIGINT', () => stop('SIGINT'));
    })
    .catch((err) => {
      logger.error(`Falha ao arrancar: ${err.message}`, { error: err.stack });
      process.exit(1);
    });
  process.on('unhandledRejection', (r) => logger.error(`Promessa rejeitada sem tratamento: ${r}`));
  process.on('uncaughtException', (e) => logger.error(`Exceção não tratada: ${e.message}`, { error: e.stack }));
}

module.exports = { start };
