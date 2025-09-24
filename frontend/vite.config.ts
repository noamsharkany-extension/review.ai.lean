import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Suppress EPIPE errors globally for WebSocket connections
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
    // These are normal WebSocket disconnection errors, ignore them
    return;
  }
  // Re-throw other uncaught exceptions
  throw error;
});

// Also handle unhandled promise rejections for WebSocket errors
process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason === 'object' && 
      (reason.code === 'EPIPE' || reason.code === 'ECONNRESET' || reason.code === 'ECONNABORTED')) {
    // These are normal WebSocket disconnection errors, ignore them
    return;
  }
  // Log other unhandled rejections
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        configure: (proxy, options) => {
          // Override the default error handler to suppress EPIPE errors
          const originalEmit = proxy.emit;
          proxy.emit = function(event, ...args) {
            if (event === 'error') {
              const error = args[0];
              // Suppress common WebSocket disconnection errors
              if (error && (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.code === 'ECONNABORTED')) {
                return; // Don't emit these errors
              }
            }
            return originalEmit.apply(this, [event, ...args]);
          };

          proxy.on('error', (err, req, res) => {
            // This should now only catch non-suppressed errors
            if (err.code === 'ECONNREFUSED') {
              console.warn('⚠️  Backend server not running on port 3001. WebSocket connections will fail.');
              console.warn('   Please start the backend server with: cd backend && npm run dev');
            } else {
              console.error('WebSocket proxy error:', err.message);
            }
          });
          
          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            // Set proper headers for WebSocket upgrade
            proxyReq.setHeader('Origin', 'http://localhost:5174');
            proxyReq.setHeader('X-Forwarded-For', req.socket.remoteAddress);
            proxyReq.setHeader('X-Forwarded-Proto', 'http');
            
            // Handle socket errors gracefully with suppression
            socket.on('error', (err) => {
              // Only log unexpected errors
              if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET' && err.code !== 'ECONNABORTED') {
                console.warn('WebSocket socket error:', err.code);
              }
            });
            
            // Handle proxy request errors with suppression
            proxyReq.on('error', (err) => {
              if (err.code === 'ECONNREFUSED') {
                console.warn('⚠️  WebSocket connection to backend failed - backend server not running');
                try {
                  socket.destroy();
                } catch (destroyError) {
                  // Ignore destroy errors
                }
              } else if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET' && err.code !== 'ECONNABORTED') {
                console.warn('WebSocket proxy request error:', err.code);
              }
            });
          });

          // Handle WebSocket upgrade errors
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.on('error', (err) => {
              if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET' && err.code !== 'ECONNABORTED') {
                console.warn('Proxy request error:', err.code);
              }
            });
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})