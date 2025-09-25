import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { ReviewAnalysisOrchestrator } from '../services/orchestration.js';
import { WebSocketMessage, AnalysisProgress, AnalysisResults } from '@shared/types';

// Add type extension for WebSocket
declare module 'ws' {
  interface WebSocket {
    isAlive?: boolean;
  }
}

export class ProgressWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<WebSocket>> = new Map();
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor(server: Server, orchestrator: ReviewAnalysisOrchestrator) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/progress',
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024, // 16MB
      clientTracking: true
    });

    this.setupWebSocketServer();
    this.setupOrchestratorListeners(orchestrator);
    this.startKeepAlive();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      console.log('WebSocket client connected from:', request.socket.remoteAddress);

      // Set up ping/pong for connection health with more robust handling
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle client messages with better error recovery
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          // Only send error if connection is still open
          if (ws.readyState === WebSocket.OPEN) {
            this.sendError(ws, 'Invalid message format');
          }
        }
      });

      // Handle client disconnect with detailed logging
      ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: ${code} ${reason.toString()}`);
        this.removeClientFromAllSessions(ws);
      });

      // Enhanced error handling for connection stability
      ws.on('error', (error: any) => {
        // Suppress common connection errors that are normal during client disconnects
        if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
          console.log(`WebSocket connection closed normally (${error.code})`);
        } else {
          console.error('WebSocket error:', error.message, error.code);
        }
        
        // Always clean up the connection
        this.removeClientFromAllSessions(ws);
        
        // Attempt to close the connection gracefully if it's still open
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.terminate();
          } catch (terminateError) {
            // Ignore termination errors
          }
        }
      });

      // Send connection confirmation with error handling
      try {
        this.sendMessage(ws, {
          type: 'connected',
          sessionId: '',
          data: { message: 'Connected to progress updates' }
        });
      } catch (error) {
        console.warn('Failed to send connection confirmation:', error);
      }
    });

    // Enhanced heartbeat with better error handling and longer timeout
    const heartbeat = setInterval(() => {
      this.wss.clients.forEach((ws: any) => {
        // Only terminate if connection has been unresponsive for multiple cycles
        if (ws.isAlive === false && ws.missedPings >= 3) {
          console.log('Terminating dead WebSocket connection after multiple missed pings');
          try {
            ws.terminate();
          } catch (error) {
            // Ignore termination errors
          }
          return;
        }
        
        // Track missed pings
        if (ws.isAlive === false) {
          ws.missedPings = (ws.missedPings || 0) + 1;
        } else {
          ws.missedPings = 0;
        }
        
        ws.isAlive = false;
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        } catch (error) {
          // If ping fails, mark as dead and it will be terminated next cycle
          ws.isAlive = false;
        }
      });
    }, 60000); // Check every 60 seconds (increased from 30)

    this.wss.on('close', () => {
      clearInterval(heartbeat);
    });

    // Handle server-level errors
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private handleClientMessage(ws: WebSocket, message: any): void {
    if (message.type === 'subscribe' && message.sessionId) {
      this.subscribeToSession(ws, message.sessionId);
    } else if (message.type === 'unsubscribe' && message.sessionId) {
      this.unsubscribeFromSession(ws, message.sessionId);
    } else {
      this.sendError(ws, 'Invalid message type or missing sessionId');
    }
  }

  private subscribeToSession(ws: WebSocket, sessionId: string): void {
    if (!this.clients.has(sessionId)) {
      this.clients.set(sessionId, new Set());
    }
    
    this.clients.get(sessionId)!.add(ws);
    
    this.sendMessage(ws, {
      type: 'subscribed',
      sessionId,
      data: { message: `Subscribed to session ${sessionId}` }
    });

    console.log(`Client subscribed to session: ${sessionId}`);
  }

  private unsubscribeFromSession(ws: WebSocket, sessionId: string): void {
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

  private removeClientFromAllSessions(ws: WebSocket): void {
    for (const [sessionId, clients] of this.clients.entries()) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(sessionId);
      }
    }
  }

  private setupOrchestratorListeners(orchestrator: ReviewAnalysisOrchestrator): void {
    // Listen for progress updates
    orchestrator.on('progress', (sessionId: string, progress: AnalysisProgress) => {
      this.broadcastToSession(sessionId, {
        type: 'progress',
        sessionId,
        data: progress
      });
    });

    // Listen for completion
    orchestrator.on('complete', (sessionId: string, results: AnalysisResults) => {
      this.broadcastToSession(sessionId, {
        type: 'complete',
        sessionId,
        data: results
      });
    });

    // Listen for errors
    orchestrator.on('error', (sessionId: string, error: { error: string }) => {
      this.broadcastToSession(sessionId, {
        type: 'error',
        sessionId,
        data: error
      });
    });
  }

  // Method to handle comprehensive collection progress updates
  public broadcastComprehensiveProgress(sessionId: string, progress: any): void {
    this.broadcastToSession(sessionId, {
      type: 'comprehensive_progress',
      sessionId,
      data: progress
    });
  }

  // Method to handle comprehensive collection completion
  public broadcastComprehensiveComplete(sessionId: string, results: any): void {
    this.broadcastToSession(sessionId, {
      type: 'comprehensive_complete',
      sessionId,
      data: results
    });
  }

  // Method to handle comprehensive collection errors
  public broadcastComprehensiveError(sessionId: string, error: { error: string }): void {
    this.broadcastToSession(sessionId, {
      type: 'comprehensive_error',
      sessionId,
      data: error
    });
  }

  private broadcastToSession(sessionId: string, message: WebSocketMessage): void {
    const sessionClients = this.clients.get(sessionId);
    if (!sessionClients) return;

    const deadClients: WebSocket[] = [];

    sessionClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      } else {
        deadClients.push(client);
      }
    });

    // Clean up dead connections
    deadClients.forEach(client => {
      sessionClients.delete(client);
    });

    if (sessionClients.size === 0) {
      this.clients.delete(sessionId);
    }
  }

  private sendMessage(ws: WebSocket, message: WebSocketMessage | any): void {
    // Check connection state before attempting to send
    if (ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not open, skipping message send');
      this.removeClientFromAllSessions(ws);
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      ws.send(messageStr);
    } catch (error: any) {
      // Handle specific error types gracefully
      if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
        console.log(`Client disconnected during send (${error.code}), cleaning up...`);
      } else {
        console.error('Error sending WebSocket message:', error.message, error.code);
      }
      
      // Always clean up the connection on send errors
      this.removeClientFromAllSessions(ws);
      
      // Attempt to close the connection if it's still in a connected state
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.terminate();
        } catch (terminateError) {
          // Ignore termination errors
        }
      }
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      sessionId: '',
      data: { error }
    });
  }

  // Get connection statistics
  public getStats(): { totalConnections: number; sessionCount: number; sessionsWithClients: string[] } {
    let totalConnections = 0;
    const sessionsWithClients: string[] = [];

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

  // Start keep-alive mechanism to prevent idle disconnections
  private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      // Send keep-alive to all connected clients
      this.wss.clients.forEach((ws: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            this.sendMessage(ws, {
              type: 'keepalive',
              sessionId: '',
              data: { timestamp: Date.now() }
            });
          } catch (error) {
            // Ignore keep-alive errors
          }
        }
      });
    }, 30000); // Send keep-alive every 30 seconds
  }

  // Graceful shutdown
  public async close(): Promise<void> {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    return new Promise((resolve) => {
      this.wss.close(() => {
        console.log('WebSocket server closed');
        resolve();
      });
    });
  }
}