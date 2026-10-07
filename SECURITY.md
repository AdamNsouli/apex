# Security and data handling

APEX changes requests through the supported native hook. It preserves permission hooks and tool arguments, never asks for skip-permission flags, never patches the Claude binary, and never reads keychain files or login tokens. Model discovery uses an opaque host authorization handle against `https://api.anthropic.com/v1/models` only.

The optional Node companion listens on 127.0.0.1 with a random port. A 256-bit URL-fragment bootstrap token grants an HttpOnly, SameSite=Strict session cookie. Mutations require exact Host/Origin checks and a CSRF token. The native bridge uses a Unix socket with mode 0600 inside a 0700 temporary directory. Browser HTTP cannot access `/native/sync`; static serving uses a fixed allowlist. Script CSP permits only local files. These controls do not isolate the companion from another process already running as the same OS user.

The bootstrap link remains valid for the lifetime of its companion. Treat it as a credential. It is removed from the browser address bar after exchange and not sent to third-party pages. The dashboard does not load CDNs or third-party scripts.

AA keys entered through Settings live in companion memory only. An environment-supplied AA key can be inherited by the child process. Do not share environment dumps, bootstrap links, private socket descriptors, local caches or real receipts publicly. No AA key or actual login credential is needed for the offline tests.

The local classifier sees prompt text in memory but stores only its category/risk flags. Receipts contain model settings, benchmark scores, token counts and tool names, not transcript text, private reasoning, file paths or tool arguments. Receipts are bounded and session-only. Export is an explicit user action.

Report security concerns privately through GitHub's security advisory facility for this repository. Do not include keys, conversation text or private receipts in public issues. The beta has not had an independent security audit.
