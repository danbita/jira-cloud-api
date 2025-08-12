import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPToolCall, MCPToolResult } from './types';
import { ZAPIER_MCP_URL } from './config';

// Helper to extract a human-readable error message
function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private isConnected: boolean = false;

  constructor() {
    // Initialize the MCP client
    this.client = new Client(
      {
        name: "jira-ai-agent",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.log('🔗 Already connected to MCP server');
      return;
    }

    try {
      console.log('🔗 Connecting to Zapier MCP server...');
      
      // Create transport with the server URL
      this.transport = new StreamableHTTPClientTransport(new URL(ZAPIER_MCP_URL || ''));
      
      // Connect to the server
      await this.client!.connect(this.transport);
      
      this.isConnected = true;
      console.log('✅ Connected to Zapier MCP server');
      
      // Log available tools for debugging
      await this.logAvailableTools();
      
    } catch (error) {
      console.error('❌ Failed to connect to MCP server:', error);
      throw new Error(`MCP connection failed: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      if (this.transport) {
        await this.transport.close();
      }
      if (this.client) {
        await this.client.close();
      }
      this.isConnected = false;
      console.log('🔌 Disconnected from MCP server');
    } catch (error) {
      console.error('Error disconnecting from MCP server:', error);
    }
  }

  async listTools(): Promise<any[]> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected. Call connect() first.');
    }

    try {
      const tools = await this.client.listTools();
      return tools.tools || [];
    } catch (error) {
      console.error('Error listing tools:', error);
      throw new Error(`Failed to list tools: ${error}`);
    }
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected. Call connect() first.');
    }

    try {
      console.log(`🔧 Calling tool: ${toolCall.name}`);
      console.log('📋 Arguments:', JSON.stringify(toolCall.arguments, null, 2));
      
      const rawResult = await this.client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments,
      });

      // Ensure content is an array of { type: string; text: string }
      const content = Array.isArray(rawResult.content)
        ? rawResult.content.map((item: any) => ({
            type: typeof item.type === 'string' ? item.type : 'text',
            text: typeof item.text === 'string' ? item.text : JSON.stringify(item.text)
          }))
        : [];

      return {
        content,
        isError: Boolean(rawResult.isError)
      };
      
    } catch (error) {
      console.error(`❌ Tool call failed for ${toolCall.name}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${toolCall.name}: ${getErrorMessage(error)}`
        }],
        isError: true
      };
    }
  }

  private async logAvailableTools(): Promise<void> {
    try {
      const tools = await this.listTools();
      console.log('\n📦 Available Jira tools:');
      // Filter and display only Jira tools
      const jiraTools = tools.filter(tool => 
        tool.name && tool.name.includes('jira_software_cloud')
      );
      jiraTools.forEach(tool => {
        console.log(`  • ${tool.name}`);
        if (tool.description) {
          console.log(`    ${tool.description}`);
        }
      });
      console.log('');
    } catch (error) {
      console.log('Could not fetch available tools:', error);
    }
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }
}