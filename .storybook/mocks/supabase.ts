/**
 * Stand-in for `src/lib/supabase.ts` in Storybook: no network, answers set per
 * story. A story says what the database returns with `mockSupabase.table()` /
 * `.rpc()`, and a test checks what was sent in `mockSupabase.calls`.
 */

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { kind: 'select' | 'insert' | 'update' | 'delete' | 'rpc' | 'function'; target: string; payload?: unknown };

const tables = new Map<string, { select?: Result; insert?: Result; update?: Result; delete?: Result }>();
const rpcs = new Map<string, (args: Record<string, unknown>) => Result>();
const functionsReplies = new Map<string, Result>();

const ok = (data: unknown = null): Result => ({ data, error: null });

export const mockSupabase = {
  calls: [] as Call[],
  /** Clears every answer and the call log (run before each story). */
  reset() {
    tables.clear();
    rpcs.clear();
    functionsReplies.clear();
    this.calls = [];
  },
  table(name: string, answers: { select?: Result; insert?: Result; update?: Result; delete?: Result }) {
    tables.set(name, answers);
  },
  rpc(name: string, answer: Result | ((args: Record<string, unknown>) => Result)) {
    rpcs.set(name, typeof answer === 'function' ? answer : () => answer);
  },
  fn(name: string, answer: Result) {
    functionsReplies.set(name, answer);
  },
  ok,
  fail: (message = 'mock failure', code?: string): Result => ({ data: null, error: { message, code } }),
};

/** A query that resolves when awaited, like supabase-js. Filters are accepted and ignored. */
function query(table: string, kind: 'select' | 'insert' | 'update' | 'delete', payload?: unknown) {
  mockSupabase.calls.push({ kind, target: table, payload });
  const answer = () => tables.get(table)?.[kind] ?? ok(kind === 'select' ? [] : null);
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'range', 'ilike', 'or', 'not', 'is', 'match', 'filter', 'select']) {
    builder[method] = chain;
  }
  builder.single = () => builder;
  builder.maybeSingle = () => {
    const base = answer();
    const one = Array.isArray(base.data) ? (base.data[0] ?? null) : base.data;
    return Promise.resolve({ ...base, data: one });
  };
  builder.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject);
  return builder;
}

const channel = () => {
  const c = { on: () => c, subscribe: () => c, unsubscribe: () => Promise.resolve('ok') };
  return c;
};

export const supabase = {
  from: (table: string) => ({
    select: () => query(table, 'select'),
    insert: (payload: unknown) => query(table, 'insert', payload),
    update: (payload: unknown) => query(table, 'update', payload),
    delete: () => query(table, 'delete'),
  }),
  rpc: (name: string, args: Record<string, unknown> = {}) => {
    mockSupabase.calls.push({ kind: 'rpc', target: name, payload: args });
    const answer = rpcs.get(name);
    return Promise.resolve(answer ? answer(args) : mockSupabase.fail(`no mock for rpc ${name}`));
  },
  functions: {
    invoke: (name: string, options?: { body?: unknown }) => {
      mockSupabase.calls.push({ kind: 'function', target: name, payload: options?.body });
      return Promise.resolve(functionsReplies.get(name) ?? mockSupabase.fail(`no mock for function ${name}`));
    },
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    setSession: () => Promise.resolve({ data: {}, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  },
  channel,
  removeChannel: () => Promise.resolve('ok'),
};

export async function callFunction() {
  return { error: 'network' as const };
}
