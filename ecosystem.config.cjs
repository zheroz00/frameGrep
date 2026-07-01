module.exports = {
    apps: [
        {
            name: 'frameGrep-Marlin',
            script: 'npm',
            args: 'run dev',
            env: {
                NODE_ENV: 'development',
            },
        },
        {
            // Local Marlin-2B analysis server (the 'marlin' provider). Runs the
            // FastAPI app in the vllm conda env via scripts/marlin-server.sh.
            //
            // Start on demand:  pm2 start ecosystem.config.cjs --only marlin-server
            // NOTE: holds ~4.4GB on GPU 0 while resident, which competes with
            // vLLM / llama-swap (both want GPU 0). Intentionally NOT added to the
            // boot resurrect set by default — run `pm2 save` yourself only if you
            // want Marlin always-on and accept that it shrinks llama-swap headroom.
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
            // GPU 0 fits ONE heavy user at a time — stop llama-server-cuda and
            // marlin-server before starting this (it grabs ~95% of the card).
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
