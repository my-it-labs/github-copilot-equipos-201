// Cliente MCP mínimo para probar el servidor sin VS Code: hace lo mismo que Copilot.
// Arranca server.ts como proceso hijo (stdio), negocia el protocolo, lista las herramientas
// y, si se le pasa una, la llama con sus argumentos.
//
//   node teatralia/tools/mcp-teatralia/probar.ts                                   # lista las herramientas
//   node teatralia/tools/mcp-teatralia/probar.ts ocupacion_evento '{"evento":"EV-FARO-0042"}'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [herramienta, argumentos = '{}'] = process.argv.slice(2);

const transport = new StdioClientTransport({
  command: process.execPath, // el mismo node que ejecuta este script
  args: [new URL('./server.ts', import.meta.url).pathname],
  env: { ...process.env } as Record<string, string>, // DATABASE_URL llega desde tu terminal
  stderr: 'ignore',
});
const client = new Client({ name: 'probar-mcp-teatralia', version: '1.0.0' });
await client.connect(transport);

if (!herramienta) {
  const { tools } = await client.listTools();
  for (const t of tools) {
    const params = Object.keys((t.inputSchema.properties ?? {}) as object).join(', ');
    console.log(`${t.name}(${params})${t.annotations?.readOnlyHint ? '  [solo lectura]' : ''}`);
    console.log(`  ${t.description}`);
  }
} else {
  const res = await client.callTool({ name: herramienta, arguments: JSON.parse(argumentos) });
  if (res.isError) console.log('ERROR de la herramienta:');
  for (const c of res.content as { type: string; text?: string }[]) console.log(c.text ?? c);
}
await client.close();
