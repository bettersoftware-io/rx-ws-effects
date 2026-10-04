// Proves the package a consumer would install, not the source in this repo.
//
//   node scripts/smoke-test-package.mts      (after `pnpm build`)
//
// Packs the tarball, installs it into an empty project next to rxjs, then
// uses it by package name twice: under Node's own resolver, and under
// TypeScript's NodeNext resolution. A build that only works from inside this
// repo (an import Node cannot resolve, a declaration that resolves to `any`)
// fails here.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_NAME = "@better-software/rx-ws-effects";

const CONSUMER = `import { Subject } from "rxjs";

import {
  combineEffects,
  createWsListener,
  type Inbound,
  type Outbound,
  rpc,
  type Socket,
} from "${PACKAGE_NAME}";

interface Context {
  greeting: string;
}

const messages$ = new Subject<Inbound>();
const closed$ = new Subject<void>();
const sent: Outbound[] = [];

const socket: Socket = {
  messages$,
  closed$,
  send: (message) => {
    sent.push(message);
  },
};

const greet = rpc<Context>("greet", "greeted", (payload, context) => {
  return \`\${context.greeting}, \${String(payload)}\`;
});

createWsListener(combineEffects(greet), { greeting: "hello" })(socket);
messages$.next({ type: "greet", payload: "world", correlationId: "1" });

const expected = JSON.stringify([
  { type: "greeted", payload: { type: "ack", payload: "hello, world" }, correlationId: "1" },
]);

if (JSON.stringify(sent) !== expected) {
  throw new Error(\`the packed package sent \${JSON.stringify(sent)}, expected \${expected}\`);
}

// If the declarations resolved to \`any\`, this wrong call would typecheck and
// the directive below would be reported as unused.
// @ts-expect-error a context is an object, not a number
createWsListener(combineEffects(greet), 42);
`;

const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    types: [],
    strict: true,
    noEmit: true,
  },
  include: ["types-check.ts"],
};

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

const workspace = mkdtempSync(join(tmpdir(), "rx-ws-effects-smoke-"));

try {
  run("pnpm", ["pack", "--pack-destination", workspace], REPOSITORY);

  const tarball = readdirSync(workspace).find((file) => file.endsWith(".tgz"));

  if (tarball === undefined) {
    throw new Error("pnpm pack produced no tarball");
  }

  const consumer = join(workspace, "consumer");

  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "consumer",
        private: true,
        type: "module",
        dependencies: { [PACKAGE_NAME]: `file:${join(workspace, tarball)}`, rxjs: "^7.8.2" },
      },
      null,
      2,
    ),
  );
  // The runtime check has to stop at the wrong call the type check wants to
  // see, so the two checks read the same file up to that point.
  writeFileSync(join(consumer, "runtime-check.ts"), CONSUMER.slice(0, CONSUMER.indexOf("// If the declarations")));
  writeFileSync(join(consumer, "types-check.ts"), CONSUMER);
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify(CONSUMER_TSCONFIG, null, 2));

  run("pnpm", ["install", "--ignore-workspace"], consumer);
  run(process.execPath, ["runtime-check.ts"], consumer);
  run(join(REPOSITORY, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.json"], consumer);

  console.log("smoke: the packed package runs under Node and typechecks under NodeNext");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
