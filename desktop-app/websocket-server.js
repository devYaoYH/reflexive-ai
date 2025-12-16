/**
 * WebSocket Server
 * Receives data from native messaging host and processes it
 */

const WebSocket = require('ws');
const crypto = require('crypto');

class WebSocketServer {
  constructor(database, port = 9876) {
    this.database = database;
    this.port = port;
    this.wss = null;
    this.clients = new Set();
  }

  /**
   * Start the WebSocket server
   */
  start() {
    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', (ws) => {
      console.log('Native host connected');
      this.clients.add(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message, ws);
        } catch (err) {
          console.error('Error parsing message:', err);
          this.sendError(ws, 'Invalid JSON');
        }
      });

      ws.on('close', () => {
        console.log('Native host disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });

      // Send welcome message
      this.send(ws, {
        type: 'connection',
        status: 'connected',
        timestamp: Date.now(),
      });
    });

    console.log(`WebSocket server listening on port ${this.port}`);
  }

  /**
   * Stop the WebSocket server
   */
  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
  }

  /**
   * Handle incoming messages from native host
   */
  handleMessage(message, ws) {
    try {
      switch (message.type) {
        case 'conversation':
          this.handleConversation(message.data);
          break;

        case 'message':
          this.handleUserMessage(message.data);
          break;

        case 'api_capture':
          this.handleApiCapture(message.data);
          break;

        case 'system_prompt':
          this.handleSystemPrompt(message.data);
          break;

        case 'streaming_chunk':
          this.handleStreamingChunk(message.data);
          break;

        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }

      // Send acknowledgment
      this.send(ws, {
        type: 'ack',
        messageId: message.id,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Error handling message:', err);
      this.sendError(ws, err.message);
    }
  }

  /**
   * Handle conversation data
   */
  handleConversation(data) {
    const conversationData = {
      id: data.id || crypto.randomUUID(),
      platform: data.platform,
      conversation_id: data.conversation_id,
      started_at: data.started_at || Date.now(),
      last_activity: data.last_activity || Date.now(),
      title: data.title,
      message_count: data.message_count || 0,
      total_tokens: data.total_tokens || 0,
      model_used: data.model_used,
      metadata: data.metadata,
    };

    this.database.upsertConversation(conversationData);
    console.log('Stored conversation:', conversationData.id);
  }

  /**
   * Handle user message
   */
  handleUserMessage(data) {
    const messageData = {
      id: data.id || crypto.randomUUID(),
      conversation_id: data.conversation_id,
      timestamp: data.timestamp || Date.now(),
      role: data.role,
      content: data.content,
      visible_to_user: data.visible_to_user,
      message_position: data.message_position,
      edited: data.edited,
      regenerated: data.regenerated,
      tokens_prompt: data.tokens_prompt,
      tokens_completion: data.tokens_completion,
      tokens_total: data.tokens_total,
      time_to_first_token_ms: data.time_to_first_token_ms,
      total_generation_time_ms: data.total_generation_time_ms,
      attachments: data.attachments,
    };

    this.database.insertMessage(messageData);
    console.log('Stored message:', messageData.id);

    // Update conversation
    this.database.upsertConversation({
      id: data.conversation_id,
      platform: data.platform,
      last_activity: Date.now(),
      message_count: (data.message_position || 0) + 1,
    });
  }

  /**
   * Handle API capture data
   */
  handleApiCapture(data) {
    const captureData = {
      id: data.id || crypto.randomUUID(),
      message_id: data.message_id,
      timestamp: data.timestamp || Date.now(),
      request_url: data.request_url,
      request_method: data.request_method,
      request_headers: data.request_headers,
      request_body: data.request_body,
      response_status: data.response_status,
      response_headers: data.response_headers,
      response_body: data.response_body,
      raw_response: data.raw_response,
      model: data.model,
      system_prompts: data.system_prompts,
      temperature: data.temperature,
      max_tokens: data.max_tokens,
      stream: data.stream,
    };

    this.database.insertApiCapture(captureData);
    console.log('Stored API capture:', captureData.id);

    // Extract and store system prompts
    if (data.system_prompts && data.system_prompts.length > 0) {
      for (const prompt of data.system_prompts) {
        this.database.upsertSystemPrompt({
          platform: data.platform || 'unknown',
          prompt_text: prompt,
          first_seen: Date.now(),
          last_seen: Date.now(),
        });
      }
    }
  }

  /**
   * Handle system prompt
   */
  handleSystemPrompt(data) {
    this.database.upsertSystemPrompt({
      platform: data.platform,
      prompt_text: data.prompt_text,
      first_seen: data.first_seen || Date.now(),
      last_seen: data.last_seen || Date.now(),
      context: data.context,
    });

    console.log('Stored system prompt');
  }

  /**
   * Handle streaming chunk
   */
  handleStreamingChunk(data) {
    const chunkData = {
      id: data.id || crypto.randomUUID(),
      message_id: data.message_id,
      chunk_index: data.chunk_index,
      timestamp: data.timestamp || Date.now(),
      content: data.content,
      delta_time_ms: data.delta_time_ms,
    };

    this.database.insertStreamingChunk(chunkData);
  }

  /**
   * Send message to client
   */
  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to client
   */
  sendError(ws, error) {
    this.send(ws, {
      type: 'error',
      error: error,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message) {
    for (const client of this.clients) {
      this.send(client, message);
    }
  }
}

module.exports = WebSocketServer;
