/**
 * HU-029 · 029a (SDD `Refactorizaciones/suscripcion-arzium-mercadopago.md` §A): prueba manual de la
 * API de suscripciones (`preapproval`) de Mercado Pago contra el SANDBOX, con usuarios de prueba.
 *
 *   npm run mp:subs-sandbox --workspace packages/db -- <subcomando> [args]
 *
 * Lee solo `.env.mp-sandbox.local` (raíz del repo). No usa la base ni el `.env` de la raíz. Todo lo
 * que imprime o guarda pasa por `redactMercadoPagoResource`. Los ids completos que devuelve MP se
 * guardan en `MP_SUBS_CAPTURE_DIR/state.json` (fuera del repo) para poder pasarle a los subcomandos
 * el id acortado que se imprime ("2c9380…"). Runbook y resultados: `docs/mp-suscripciones-sandbox.md`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MercadoPagoConfig, { Invoice, Payment, PreApproval, User } from "mercadopago";
import { assertCaptureDirOutsideRepo, assertSandboxEnv, assertSandboxSeller } from "./lib/mp-sandbox-guard";
import { collectMercadoPagoIds, mergeIds, resolveIdArg } from "./lib/mp-sandbox-ids";
import {
  buildPreapprovalBody,
  describeMercadoPagoError,
  makeExternalReference,
  parseCreateArgs,
  projectInvoice,
  projectPayment,
  projectPreapproval,
} from "./lib/mp-sandbox-payloads";
import { redactMercadoPagoResource } from "./lib/mp-sandbox-redact";
import { analyzeWebhookRequest } from "./lib/mp-sandbox-webhook";

const HELP = `Uso: npm run mp:subs-sandbox --workspace packages/db -- <subcomando>

  whoami                                   /users/me (id, site_id, tags)                 S13 S17
  create [--freq N] [--unit months|days] [--trial N] [--trial-unit days|months]
         [--amount ARS] [--cycles N | --end-date ISO] [--no-email]
         [--idem KEY] [--ref sbx_...] [--open]  POST /preapproval pending, sin plan       S1 S3 S4 S5 S15 S16
  get <preapprovalId>                      GET /preapproval/{id}                         S1 S2 S8 S9 S13 S15
  search --ref <externalReference>         /preapproval/search?external_reference=      S2
  cancel <preapprovalId>                   PUT status=cancelled + GET                    S8
  pause <preapprovalId>                    PUT status=paused + GET                       S8
  invoices <preapprovalId>                 /authorized_payments/search?preapproval_id=  S10 S11
  invoice <id>                             GET /authorized_payments/{id}                 S11
  payment <paymentId>                      GET /v1/payments/{id}                         S12
  listen                                   receptor local de webhooks y del back_url     S6 S7

Los ids se pueden pasar acortados ("2c9380…") si el script ya los vio.`;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const captureDir = resolve(process.env.MP_SUBS_CAPTURE_DIR || join(tmpdir(), "numa-mp-subs-sandbox"));
const statePath = join(captureDir, "state.json");

type State = { ids: string[]; initPoints: Record<string, string> };

function readState(): State {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<State>;
    return { ids: parsed.ids ?? [], initPoints: parsed.initPoints ?? {} };
  } catch {
    return { ids: [], initPoints: {} };
  }
}

function writeState(state: State) {
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

/** Recuerda (en local, completos) los ids que aparecen en una respuesta de MP. */
function remember(value: unknown) {
  const state = readState();
  writeState({ ...state, ids: mergeIds(state.ids, collectMercadoPagoIds(value)) });
}

function print(label: string, value: unknown) {
  console.log(`\n── ${label}`);
  console.log(JSON.stringify(value, null, 2));
}

function requireArg(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Falta un argumento. Uso: ${usage}`);
  return resolveIdArg(value, readState().ids);
}

function openInBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(cmd, [url], (err) => {
    if (err) console.error(`No pude abrir el navegador (${cmd}). Abrí la url del archivo a mano.`);
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(HELP);
    return;
  }

  // Compuertas (SDD §A.4): sandbox explícito, nunca producción, nunca una cuenta real.
  assertSandboxEnv(process.env);
  assertCaptureDirOutsideRepo(captureDir, repoRoot);
  mkdirSync(captureDir, { recursive: true, mode: 0o700 });
  const accessToken = process.env.ARZIUM_MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Falta ARZIUM_MERCADOPAGO_ACCESS_TOKEN (del vendedor de prueba) en .env.mp-sandbox.local.");
  const config = new MercadoPagoConfig({ accessToken, options: { timeout: 15000 } });
  const me = await new User(config).get();
  assertSandboxSeller(me);
  const sellerId = me.id ?? null;
  remember({ seller_id: me.id });

  const preapproval = new PreApproval(config);

  switch (command) {
    case "whoami": {
      print("/users/me", redactMercadoPagoResource({ id: me.id, site_id: me.site_id, tags: me.tags, user_type: me.user_type }));
      return;
    }

    case "create": {
      const opts = parseCreateArgs(rest);
      const externalReference = opts.externalReference ?? makeExternalReference(randomBytes(8));
      const idempotencyKey = opts.idempotencyKey ?? randomUUID();
      const body = buildPreapprovalBody({
        opts,
        externalReference,
        backUrl: process.env.MP_SUBS_BACK_URL ?? "",
        payerEmail: process.env.MP_SUBS_BUYER_EMAIL,
        now: new Date(),
      });
      print("request POST /preapproval", redactMercadoPagoResource({ idempotency_key: idempotencyKey, body }));
      const response = await preapproval.create({ body, requestOptions: { idempotencyKey } });
      remember(response);
      print("response", projectPreapproval(response, sellerId));
      if (response.init_point) {
        const state = readState();
        writeState({ ...state, initPoints: { ...state.initPoints, [externalReference]: response.init_point } });
        const file = join(captureDir, `init-point-${externalReference}.txt`);
        writeFileSync(file, `${response.init_point}\n`, { mode: 0o600 });
        console.log(`\ninit_point completo (solo local, no va al informe): ${file}`);
        console.log("Abrilo en una ventana privada, logueado como el COMPRADOR de prueba.");
        if (opts.open) openInBrowser(response.init_point);
      }
      console.log(`\nexternal_reference: ${externalReference} · X-Idempotency-Key: ${idempotencyKey}`);
      return;
    }

    case "get": {
      const id = requireArg(rest[0], "get <preapprovalId>");
      const response = await preapproval.get({ id });
      remember(response);
      print(`GET /preapproval/${rest[0]}`, projectPreapproval(response, sellerId));
      return;
    }

    case "search": {
      const refIndex = rest.indexOf("--ref");
      const ref = refIndex === -1 ? undefined : rest[refIndex + 1];
      if (!ref) throw new Error("Uso: search --ref <externalReference>");
      const response = await preapproval.search({ options: { external_reference: ref } });
      remember(response);
      print(`/preapproval/search?external_reference=${ref}`, {
        paging: response.paging,
        results: (response.results ?? []).map((r) => projectPreapproval(r, sellerId)),
      });
      return;
    }

    case "cancel":
    case "pause": {
      const id = requireArg(rest[0], `${command} <preapprovalId>`);
      const status = command === "cancel" ? "cancelled" : "paused";
      try {
        const updated = await preapproval.update({ id, body: { status } });
        remember(updated);
        print(`PUT /preapproval/${rest[0]} status=${status}`, projectPreapproval(updated, sellerId));
      } catch (error) {
        print(`PUT /preapproval/${rest[0]} status=${status} → error`, describeMercadoPagoError(error));
      }
      const after = await preapproval.get({ id });
      remember(after);
      print(`GET /preapproval/${rest[0]} (después)`, projectPreapproval(after, sellerId));
      return;
    }

    case "invoices": {
      const id = requireArg(rest[0], "invoices <preapprovalId>");
      const response = await new Invoice(config).search({ options: { preapproval_id: id } });
      remember(response);
      print(`/authorized_payments/search?preapproval_id=${rest[0]}`, {
        paging: response.paging,
        results: (response.results ?? []).map(projectInvoice),
      });
      return;
    }

    case "invoice": {
      const id = requireArg(rest[0], "invoice <id>");
      const response = await new Invoice(config).get({ id });
      remember(response);
      print(`GET /authorized_payments/${rest[0]}`, projectInvoice(response));
      return;
    }

    case "payment": {
      const id = requireArg(rest[0], "payment <paymentId>");
      const response = await new Payment(config).get({ id });
      remember(response);
      print(`GET /v1/payments/${rest[0]}`, projectPayment(response));
      return;
    }

    case "listen": {
      const secret = process.env.ARZIUM_MERCADOPAGO_WEBHOOK_SECRET;
      if (!secret) throw new Error("Falta ARZIUM_MERCADOPAGO_WEBHOOK_SECRET (clave secreta de la aplicación de prueba).");
      const port = Number(process.env.MP_SUBS_LISTEN_PORT || 4010);
      const capturesDir = join(captureDir, "captures");
      mkdirSync(capturesDir, { recursive: true, mode: 0o700 });
      let seq = 0;
      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 1024 * 1024) chunks.push(chunk);
        });
        req.on("end", () => {
          const record = analyzeWebhookRequest({
            method: req.method ?? "GET",
            url: req.url ?? "/",
            headers: req.headers,
            rawBody: Buffer.concat(chunks).toString("utf8"),
            secret,
          });
          remember(record);
          const redacted = redactMercadoPagoResource({ received_at: new Date().toISOString(), ...record });
          const file = join(capturesDir, `${Date.now()}-${String(++seq).padStart(3, "0")}.json`);
          writeFileSync(file, JSON.stringify(redacted, null, 2), { mode: 0o600 });
          const r = redacted as typeof record;
          console.log(
            `${new Date().toISOString()} ${r.method} ${r.path} type=${r.query.type ?? r.query.topic ?? "-"} `
            + `data.id(query)=${r.query_data_id ?? "-"} data.id(body)=${r.body_data_id ?? "-"} `
            + `firma=${r.signature.present ? r.signature.valid_with : "sin x-signature"}`
            + `${r.back_url_preapproval_id ? " back_url con preapproval_id" : ""} → ${file}`,
          );
          if (record.back_url_preapproval_id) {
            res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            res.end("Volviste del checkout de Mercado Pago (sandbox). Podés cerrar esta pestaña.");
          } else {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("ok");
          }
        });
      });
      server.listen(port, () => {
        console.log(`Escuchando en http://localhost:${port} · capturas redactadas en ${capturesDir}`);
        console.log("Exponelo con un túnel (p. ej. cloudflared tunnel --url http://localhost:" + port + "). Ctrl+C para cortar.");
      });
      return;
    }

    default:
      console.error(`Subcomando desconocido: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  print("error", describeMercadoPagoError(error));
  process.exitCode = 1;
});
