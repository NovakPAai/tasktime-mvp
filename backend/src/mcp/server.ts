import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load env file before any other imports
// MCP_ENV: development (default) | staging | production
const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ENV = process.env.MCP_ENV ?? 'development';
const envFile = MCP_ENV === 'development' ? '.env' : `.env.${MCP_ENV}`;
config({ path: resolve(__dirname, `../../${envFile}`) });

// MCP_TRANSPORT: stdio (default, for local Claude Code) | http (for remote servers)
const mcpTransport = process.env.MCP_TRANSPORT ?? 'stdio';

if (mcpTransport === 'http') {
  await import('./http-transport.js');
} else {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { createMcpServer } = await import('./create-server.js');

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
