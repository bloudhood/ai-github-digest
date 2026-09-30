const EMAIL_STUB = "data:text/javascript,export class EmailMessage { constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; } }";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:email") {
    return {
      url: EMAIL_STUB,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

