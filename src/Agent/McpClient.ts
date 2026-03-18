import { spawn, ChildProcessWithoutNullStreams } from "child_process";

/**
 * A lightweight MCP client that communicates with a stdio MCP server.
 * It spawns the server as a child process and exchanges JSON-RPC messages
 * over stdin / stdout.
 */
export class McpClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  private nextId = 1;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly serverPath: string) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  private start(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.process = spawn("node", [this.serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout.on("data", (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.flushBuffer();
      });

      this.process.stderr.on("data", (chunk: Buffer) => {
        // MCP servers log to stderr — swallow silently unless debugging
        const line = chunk.toString().trim();
        if (process.env.MCP_DEBUG === "true") {
          console.log("[McpClient stderr]", line);
        }
      });

      this.process.on("error", (err) => {
        reject(err);
      });

      this.process.on("exit", (code) => {
        if (!this.initialized) {
          reject(new Error(`MCP process exited early with code ${code}`));
        }
        this.process = null;
        this.initPromise = null;
        this.initialized = false;
      });

      // Send the MCP initialization handshake
      this.sendRaw({
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "gramonta-bot", version: "1.0.0" },
        },
      })
        .then(() => {
          // Send initialized notification (no response expected)
          this.sendNotification({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          });
          this.initialized = true;
          resolve();
        })
        .catch(reject);
    });

    return this.initPromise;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initialized = false;
    this.initPromise = null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.start();

    const result = await this.sendRaw({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    });

    // MCP tool results look like: { content: [{ type: 'text', text: '...' }] }
    const toolResult = result as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textParts = (toolResult.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);

    return textParts.join("\n");
  }

  // -------------------------------------------------------------------------
  // Internal JSON-RPC helpers
  // -------------------------------------------------------------------------

  private sendNotification(message: Record<string, unknown>): void {
    if (!this.process) {
      return;
    }
    this.process.stdin.write(JSON.stringify(message) + "\n");
  }

  private sendRaw(message: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        return reject(new Error("MCP process is not running"));
      }

      const id = message.id as number;
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(message) + "\n");

      // Timeout safety net — 60 s should be enough for a web search
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request ${id} timed out`));
        }
      }, 60_000);

      // Clear the timer once the request resolves
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });
    });
  }

  private flushBuffer(): void {
    const lines = this.buffer.split("\n");
    // Keep the last (potentially incomplete) fragment in the buffer
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Not a JSON line — ignore (MCP servers sometimes emit non-JSON to stdout)
        continue;
      }

      const id = parsed.id as number | undefined;
      if (id === undefined || !this.pendingRequests.has(id)) {
        continue;
      }

      const { resolve, reject } = this.pendingRequests.get(id)!;
      this.pendingRequests.delete(id);

      if (parsed.error) {
        reject(new Error(JSON.stringify(parsed.error)));
      } else {
        resolve(parsed.result);
      }
    }
  }
}
