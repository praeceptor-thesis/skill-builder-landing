export interface Env {}

export default {
  async fetch(): Promise<Response> {
    return new Response('Skill Builder worker entrypoint is reserved for the session-based chat worker.', {
      status: 501,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
} satisfies ExportedHandler<Env>;
