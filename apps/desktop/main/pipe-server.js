'use strict';

const net = require('node:net');
const {
  encodeMessage,
  isPackageGuardRequest,
  PIPE_NAME
} = require('@package-guard/shared');

class PipeServer {
  constructor(events) {
    this.events = events;
    this.server = undefined;
  }

  start() {
    if (this.server) return;

    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.server.on('listening', () => {
      console.log('[PIPE] Server started on ' + PIPE_NAME);
      if (this.events.onListening) this.events.onListening();
    });
    this.server.on('error', (error) => {
      console.error(`[PIPE] Server error: ${error.message}`);
      if (this.events.onError) this.events.onError(error);
    });
    this.server.listen(PIPE_NAME);
  }

  stop() {
    if (!this.server) return;

    this.server.close((error) => {
      if (error) {
        console.error(`[PIPE] Close error: ${error.message}`);
      }
    });
    this.server = undefined;
  }

  handleConnection(socket) {
    console.log('[PIPE] Client connected');
    if (this.events.onClientConnected) this.events.onClientConnected();

    let buffer = '';
    let closed = false;

    const disconnect = () => {
      if (closed) return;
      closed = true;
      console.log('[PIPE] Client disconnected');
      if (this.events.onClientDisconnected) this.events.onClientDisconnected();
    };

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');

        if (!line) continue;
        this.handleMessage(socket, line);
      }
    });
    socket.on('close', disconnect);
    socket.on('error', (error) => {
      console.error(`[PIPE] Client error: ${error.message}`);
      disconnect();
    });
  }

  handleMessage(socket, line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.error('[PIPE] Malformed JSON received');
      socket.destroy();
      return;
    }

    if (!isPackageGuardRequest(parsed)) {
      console.error('[PIPE] Invalid request received');
      socket.destroy();
      return;
    }

    const request = parsed;
    console.log('[PIPE] Request received:', request.id);

    // Notify main — returns true if the event was successfully persisted/synced
    const persisted = this.events.onRequest ? this.events.onRequest(request) : true;

    // Always send PONG first (existing protocol contract)
    const pong = {
      id: request.id,
      type: 'PONG',
      payload: { message: 'Hello from Electron' }
    };

    socket.write(encodeMessage(pong), () => {
      console.log('[PIPE] PONG sent');
      if (this.events.onResponse) this.events.onResponse();

      // Then send ACK so CLI can mark its DB record SYNCED
      const ack = {
        id: request.id,
        type: 'ACK',
        payload: { synced: persisted }
      };

      socket.write(encodeMessage(ack), () => {
        console.log('[PIPE] ACK sent (synced=' + String(persisted) + ')');
      });
    });
  }
}

module.exports = { PipeServer };
