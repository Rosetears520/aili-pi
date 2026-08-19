// Node --test harness hook: jiti compiles the TSX component graph but has no
// CSS-module loader, so it falls back to a native import that Node rejects.
// This loader stubs every *.module.css with a class-name identity proxy.
// Registered from the .mjs component tests via node:module's register().
export async function resolve(specifier, context, next) {
  if (specifier.endsWith(".module.css")) {
    return {
      url: "data:text/javascript,export default new Proxy({},{get:(_,p)=>String(p)})",
      shortCircuit: true,
      format: "module",
    };
  }
  return next(specifier, context);
}
