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
    ],
};
