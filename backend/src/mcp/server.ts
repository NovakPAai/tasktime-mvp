import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from backend root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerIssueTools } from './tools/issues.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerTimeTools } from './tools/time.js';
import { registerCommentTools } from './tools/comments.js';
import { registerAgentTools } from './tools/agent.js';

const server = new McpServer({
  name: 'flow-universe',
  version: '1.0.0',
});

registerIssueTools(server);
registerSprintTools(server);
registerTimeTools(server);
registerCommentTools(server);
registerAgentTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
