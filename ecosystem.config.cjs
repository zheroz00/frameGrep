module.exports = {
    apps: [
        {
            // The main web app (Vite dev server). Port/bind come from .env.local
            // (FRAMEGREP_PORT / FRAMEGREP_HOST); defaults are 3008 / 127.0.0.1.
            name: 'frameGrep',
            script: 'npm',
            args: 'run dev',
            env: {
                NODE_ENV: 'development',
            },
        },
        {
            // Local Marlin-2B analysis server (the 'marlin' provider). Runs the
            // FastAPI app via scripts/marlin-server.sh.
            //
            // Start on demand:  pm2 start ecosystem.config.cjs --only marlin-server
            // NOTE: holds ~4.4GB VRAM while resident, which competes with any other
            // heavy user of the same GPU. Intentionally NOT added to the boot
            // resurrect set by default — run `pm2 save` yourself only if you want
            // Marlin always-on and accept that it shrinks other GPU headroom.
            name: 'marlin-server',
            script: 'scripts/marlin-server.sh',
            interpreter: 'bash',
            cwd: __dirname,
            autorestart: true,
            max_restarts: 5,
            env: {
                GPU: '0',
                PORT: '8003',
            },
        },
        {
            // General-purpose vLLM server (the 'vllm' custom provider, native video).
            // Serves standard VLM architectures (Qwen-VL, etc.) — NOT Marlin, whose
            // arch vLLM can't load (that's why marlin-server exists separately).
            //
            // Start on demand:  pm2 start ecosystem.config.cjs --only vllm-server
            // Model lives in .env.local (VLLM_MODEL / VLLM_MAX_LEN); to switch:
            //   edit .env.local, then `pm2 restart vllm-server --update-env`.
            //
            // A single GPU fits ONE heavy user at a time — stop other GPU users
            // (e.g. marlin-server) before starting this (it grabs ~95% of the card).
            // Intentionally NOT in the boot resurrect set (run `pm2 save` to pin).
            name: 'vllm-server',
            script: 'scripts/vllm-server.sh',
            interpreter: 'bash',
            cwd: __dirname,
            autorestart: true,
            max_restarts: 5,
            env: {
                GPU: '0',
                PORT: '8002',
            },
        },
    ],
};
