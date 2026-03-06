import { defineConfig, loadEnv } from 'vite'
import laravel from 'laravel-vite-plugin'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const port = Number(env.VITE_PORT ?? 5173)

    return {
        plugins: [
            laravel({
                input: [
                    'resources/css/app.css',
                    'resources/js/app.js',
                    'resources/css/filament/admin/theme.css',
                ],
                refresh: true,
            }),
        ],
        server: {
            host: '0.0.0.0',
            port,
            strictPort: true,
            hmr: {
                host: 'localhost',
                port,
            },
        },
    }
})
