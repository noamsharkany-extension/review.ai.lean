import { WebSocketServer, WebSocket } from 'ws';
export class ProgressWebSocketServer {
    constructor(server, orchestrator) {
        this.clients = new Map();
        this.wss = new WebSocketServer({
            server,
            path: '/ws/progress',
            perMessageDeflate: false,
            maxPayload: 16 * 1024 * 1024,
            clientTracking: true
        });
        this.setupWebSocketServer();
        this.setupOrchestratorListeners(orchestrator);
    }
    setupWebSocketServer() {
        this.wss.on('connection', (ws, request) => {
            console.log('WebSocket client connected from:', request.socket.remoteAddress);
            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleClientMessage(ws, message);
                }
                catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                    if (ws.readyState === WebSocket.OPEN) {
                        this.sendError(ws, 'Invalid message format');
                    }
                }
            });
            ws.on('close', (code, reason) => {
                console.log(`WebSocket client disconnected: ${code} ${reason.toString()}`);
                this.removeClientFromAllSessions(ws);
            });
            ws.on('error', (error) => {
                if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
                    console.log(`WebSocket connection closed normally (${error.code})`);
                }
                else {
                    console.error('WebSocket error:', error.message, error.code);
                }
                this.removeClientFromAllSessions(ws);
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    try {
                        ws.terminate();
                    }
                    catch (terminateError) {
                    }
                }
            });
            try {
                this.sendMessage(ws, {
                    type: 'connected',
                    sessionId: '',
                    data: { message: 'Connected to progress updates' }
                });
            }
            catch (error) {
                console.warn('Failed to send connection confirmation:', error);
            }
        });
        const heartbeat = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log('Terminating dead WebSocket connection');
                    try {
                        ws.terminate();
                    }
                    catch (error) {
                    }
                    return;
                }
                ws.isAlive = false;
                try {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.ping();
                    }
                }
                catch (error) {
                    ws.isAlive = false;
                }
            });
        }, 30000);
        this.wss.on('close', () => {
            clearInterval(heartbeat);
        });
        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
        });
    }
    handleClientMessage(ws, message) {
        if (message.type === 'subscribe' && message.sessionId) {
            this.subscribeToSession(ws, message.sessionId);
        }
        else if (message.type === 'unsubscribe' && message.sessionId) {
            this.unsubscribeFromSession(ws, message.sessionId);
        }
        else {
            this.sendError(ws, 'Invalid message type or missing sessionId');
        }
    }
    subscribeToSession(ws, sessionId) {
        if (!this.clients.has(sessionId)) {
            this.clients.set(sessionId, new Set());
        }
        this.clients.get(sessionId).add(ws);
        this.sendMessage(ws, {
            type: 'subscribed',
            sessionId,
            data: { message: `Subscribed to session ${sessionId}` }
        });
        console.log(`Client subscribed to session: ${sessionId}`);
    }
    unsubscribeFromSession(ws, sessionId) {
        const sessionClients = this.clients.get(sessionId);
        if (sessionClients) {
            sessionClients.delete(ws);
            if (sessionClients.size === 0) {
                this.clients.delete(sessionId);
            }
        }
        this.sendMessage(ws, {
            type: 'unsubscribed',
            sessionId,
            data: { message: `Unsubscribed from session ${sessionId}` }
        });
        console.log(`Client unsubscribed from session: ${sessionId}`);
    }
    removeClientFromAllSessions(ws) {
        for (const [sessionId, clients] of this.clients.entries()) {
            clients.delete(ws);
            if (clients.size === 0) {
                this.clients.delete(sessionId);
            }
        }
    }
    setupOrchestratorListeners(orchestrator) {
        orchestrator.on('progress', (sessionId, progress) => {
            this.broadcastToSession(sessionId, {
                type: 'progress',
                sessionId,
                data: progress
            });
        });
        orchestrator.on('complete', (sessionId, results) => {
            this.broadcastToSession(sessionId, {
                type: 'complete',
                sessionId,
                data: results
            });
        });
        orchestrator.on('error', (sessionId, error) => {
            this.broadcastToSession(sessionId, {
                type: 'error',
                sessionId,
                data: error
            });
        });
    }
    broadcastComprehensiveProgress(sessionId, progress) {
        this.broadcastToSession(sessionId, {
            type: 'comprehensive_progress',
            sessionId,
            data: progress
        });
    }
    broadcastComprehensiveComplete(sessionId, results) {
        this.broadcastToSession(sessionId, {
            type: 'comprehensive_complete',
            sessionId,
            data: results
        });
    }
    broadcastComprehensiveError(sessionId, error) {
        this.broadcastToSession(sessionId, {
            type: 'comprehensive_error',
            sessionId,
            data: error
        });
    }
    broadcastToSession(sessionId, message) {
        const sessionClients = this.clients.get(sessionId);
        if (!sessionClients)
            return;
        const deadClients = [];
        sessionClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                this.sendMessage(client, message);
            }
            else {
                deadClients.push(client);
            }
        });
        deadClients.forEach(client => {
            sessionClients.delete(client);
        });
        if (sessionClients.size === 0) {
            this.clients.delete(sessionId);
        }
    }
    sendMessage(ws, message) {
        if (ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket not open, skipping message send');
            this.removeClientFromAllSessions(ws);
            return;
        }
        try {
            const messageStr = JSON.stringify(message);
            ws.send(messageStr);
        }
        catch (error) {
            if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
                console.log(`Client disconnected during send (${error.code}), cleaning up...`);
            }
            else {
                console.error('Error sending WebSocket message:', error.message, error.code);
            }
            this.removeClientFromAllSessions(ws);
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                try {
                    ws.terminate();
                }
                catch (terminateError) {
                }
            }
        }
    }
    sendError(ws, error) {
        this.sendMessage(ws, {
            type: 'error',
            sessionId: '',
            data: { error }
        });
    }
    getStats() {
        let totalConnections = 0;
        const sessionsWithClients = [];
        for (const [sessionId, clients] of this.clients.entries()) {
            totalConnections += clients.size;
            if (clients.size > 0) {
                sessionsWithClients.push(sessionId);
            }
        }
        return {
            totalConnections,
            sessionCount: this.clients.size,
            sessionsWithClients
        };
    }
    async close() {
        return new Promise((resolve) => {
            this.wss.close(() => {
                console.log('WebSocket server closed');
                resolve();
            });
        });
    }
}
//# sourceMappingURL=progressSocket.js.map