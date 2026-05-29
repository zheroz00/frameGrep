module.exports = {
    apps: [
        {
            name: 'fpv-ai-editor',
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
    ],
};
