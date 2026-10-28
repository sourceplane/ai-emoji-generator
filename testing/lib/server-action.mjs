#!/usr/bin/env node
// Call one of the site's server actions over HTTP, as the page's own client
// does: the action's id comes from the build's server-reference manifest, and
// its arguments are encoded with React's own reply encoder — the copy Next
// ships for the bundler that built it — so the wire format is never
// hand-written here.
//
// Run from the built app's directory (apps/web), so `next` resolves:
//   node server-action.mjs <base-url> <exportedName> key=value [key=value …]
//       one FormData argument, as a <form action> sends it
//   node server-action.mjs <base-url> <exportedName> --args '<json array>'
//       the arguments as they are (an action called from code)
//   node server-action.mjs <base-url> <exportedName> --prev '<json>' key=value …
//       a useActionState action: the previous state, then the FormData
// COOKIE in the environment is sent as the Cookie header (a signed-in call).
// Prints the HTTP status, then — for --args and --prev — the action's result
// as JSON, and `redirect <path>` when the action redirected (Next answers an
// action's redirect() with 303 and the target in x-action-redirect); exits
// non-zero on anything but 200 or that 303.
import * as fs from "node:fs";
import { createRequire } from "node:module";

const [base, name, ...rest] = process.argv.slice(2);
if (!base || !name) {
  console.error("usage: server-action.mjs <base-url> <exportedName> (key=value … | --args '<json>')");
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const id = Object.entries(manifest.node ?? {}).find(([, v]) => v.exportedName === name)?.[0];
if (!id) {
  console.error(`server-action: no action named ${name} in the build's manifest`);
  process.exit(1);
}
const require = createRequire(`${process.cwd()}/package.json`);
// The encoder of the bundler that built it: this site builds with webpack
// (`next build --webpack`), which leaves no Turbopack output behind.
const bundler = fs.existsSync(".next/server/chunks/ssr") ? "turbopack" : "webpack";
const { encodeReply } = require(`next/dist/compiled/react-server-dom-${bundler}/client.node`);

const formOf = (pairs) => {
  const form = new FormData();
  for (const pair of pairs) {
    const i = pair.indexOf("=");
    form.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return form;
};
let args;
const json = rest[0] === "--args" || rest[0] === "--prev";
if (rest[0] === "--args") {
  args = JSON.parse(rest[1] ?? "[]");
} else if (rest[0] === "--prev") {
  args = [JSON.parse(rest[1] ?? "null") ?? undefined, formOf(rest.slice(2))];
} else {
  args = [formOf(rest)];
}
const headers = { "Next-Action": id, Accept: "text/x-component" };
if (process.env.COOKIE) headers.Cookie = process.env.COOKIE;
const response = await fetch(`${base}/`, { method: "POST", headers, body: await encodeReply(args), redirect: "manual" });
console.log(response.status);
const redirected = response.headers.get("x-action-redirect");
if (redirected) console.log(`redirect ${redirected.split(";")[0]}`);
if (json) {
  // The RSC payload's rows are `<id>:<json>`; the action's result is row 1.
  const text = await response.text();
  const row = text.split("\n").find((line) => line.startsWith("1:"));
  console.log(row ? row.slice(2) : JSON.stringify({ unparsed: text.slice(0, 500) }));
}
process.exit(response.status === 200 || (response.status === 303 && redirected) ? 0 : 1);
