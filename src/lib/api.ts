const API_BASE_URL = 'http://localhost:8000/api';
const WS_BASE_URL = 'ws://localhost:8000/api';

export async function uploadDocument(file: File): Promise<{ document_id: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload document');
  }

  return response.json();
}

// Base WebSocket class with all the common functionality
export class BaseWebSocket {
  protected ws: WebSocket | null = null;
  protected messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  protected reconnectAttempts = 0;
  protected maxReconnectAttempts = 5;
  protected reconnectDelay = 1000;
  protected isConnecting = false;
  protected messageQueue: { event: string; data: any }[] = [];
  protected documentId: string;
  protected connectionPromise: Promise<void> | null = null;

  constructor(documentId: string, protected endpoint: string) {
    this.documentId = documentId;
    this.connectionPromise = this.connect();
  }

  protected connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return this.connectionPromise!;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      console.log(`Connecting to WebSocket for document ${this.documentId} at ${this.endpoint}...`);
      const ws = new WebSocket(`${WS_BASE_URL}${this.endpoint}/${this.documentId}`);
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeoutId);
        ws.onopen = null;
        ws.onerror = null;
      };

      // Connection timeout
      timeoutId = setTimeout(() => {
        cleanup();
        const error = new Error('WebSocket connection timeout');
        console.error(error);
        reject(error);
        this.handleReconnect();
      }, 5000);

      ws.onopen = () => {
        cleanup();
        console.log('WebSocket connected to', this.endpoint);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.ws = ws;
        this.flushMessageQueue();
        resolve();
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        this.ws = null;
        this.isConnecting = false;
        this.handleReconnect();
      };

      ws.onerror = (error) => {
        cleanup();
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        reject(error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Raw WebSocket message:', event.data);
          console.log('Parsed WebSocket message:', message);
          
          const { type, data } = message;
          
          const handlers = this.messageHandlers.get(type);
          if (handlers) {
            console.log('Found handlers for type:', type);
            handlers.forEach((handler) => handler(data));
          } else {
            console.log('No handlers for message type:', type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    });

    return this.connectionPromise;
  }

  protected handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.log(`Attempting to reconnect in ${delay}ms...`);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connectionPromise = this.connect();
    }, delay);
  }

  protected flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message.event, message.data);
      }
    }
  }

  public async send(event: string, data: any) {
    // Wait for connection before sending
    try {
      await this.connectionPromise;
    } catch (error) {
      console.error('Connection failed:', error);
      this.messageQueue.push({ event, data });
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready, queueing message...');
      this.messageQueue.push({ event, data });
      return;
    }

    try {
      const message = { type: event, data };
      console.log('Sending WebSocket message:', message);
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      this.messageQueue.push({ event, data });
    }
  }

  public onMessage(event: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)?.push(handler);
  }

  public off(event: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  public close() {
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection attempts
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.messageQueue = [];
  }

  public async waitForConnection(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    return this.connectionPromise || this.connect();
  }
}

// Document-specific WebSocket
export class DocumentWebSocket extends BaseWebSocket {
  private pendingMetadataRequest = false;

  constructor(documentId: string) {
    super(documentId, '/documents/stream');
  }

  protected connect(): Promise<void> {
    return super.connect().then(() => {
      // Send initial metadata request after connection
      if (!this.pendingMetadataRequest) {
        this.pendingMetadataRequest = true;
        this.send('document.metadata', { document_id: this.documentId });
      }
    });
  }

  protected handleReconnect() {
    this.pendingMetadataRequest = false;
    super.handleReconnect();
  }
}

// Conversation-specific WebSocket
export class ConversationWebSocket extends BaseWebSocket {
  constructor(documentId: string) {
    super(documentId, '/conversations/stream');
  }

  // Override handleMessage to handle conversation-specific messages
  protected handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);
      console.log('Raw WebSocket message:', event.data);
      console.log('Parsed WebSocket message:', message);
      
      const { type, data, error } = message;
      
      if (error) {
        console.error('WebSocket error:', error);
        const handlers = this.messageHandlers.get(`${type}.error`);
        if (handlers) {
          handlers.forEach(handler => handler({ error }));
        }
        return;
      }
      
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        console.log('Found handlers for type:', type);
        handlers.forEach(handler => handler(data));
      } else {
        console.log('No handlers for message type:', type);
      }
    } catch (error) {
      console.error('Failed to handle WebSocket message:', error);
    }
  }

  async getMessages(conversationId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const messageType = 'conversation.messages.get';
      const responseType = 'conversation.messages.get.completed';
      const errorType = 'conversation.messages.get.error';

      // Set up one-time handler for messages response
      const handler = (data: any) => {
        console.log('Messages response:', data);
        resolve(data);
        this.off(responseType, handler);
        this.off(errorType, errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error('Failed to fetch messages:', data);
        reject(new Error(data.error || 'Failed to fetch messages'));
        this.off(responseType, handler);
        this.off(errorType, errorHandler);
      };

      // Register handlers
      this.onMessage(responseType, handler);
      this.onMessage(errorType, errorHandler);

      // Request messages
      this.send(messageType, { conversation_id: conversationId });
    });
  }
}
