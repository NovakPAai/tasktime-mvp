import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerIssueTools } from './tools/issues.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerTimeTools } from './tools/time.js';
import { registerCommentTools } from './tools/comments.js';
import { registerAgentTools } from './tools/agent.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'flow-universe',
    version: '1.0.0',
  });

  registerIssueTools(server);
  registerSprintTools(server);
  registerTimeTools(server);
  registerCommentTools(server);
  registerAgentTools(server);

  return server;
}
