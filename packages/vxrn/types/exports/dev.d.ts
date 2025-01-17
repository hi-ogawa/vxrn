/// <reference types="node" />
import type { VXRNConfig } from '../types';
export declare const dev: ({ clean, ...rest }: VXRNConfig & {
    clean?: boolean;
}) => Promise<{
    server: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
    viteServer: import("vite").ViteDevServer;
    start(): Promise<{
        closePromise: Promise<unknown>;
    }>;
    stop: () => Promise<void>;
}>;
//# sourceMappingURL=dev.d.ts.map