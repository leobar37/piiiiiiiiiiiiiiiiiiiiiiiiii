// Minimal Bun type declarations for the dashboard package
// Avoids depending on bun-types globally which affects other packages

declare namespace Bun {
	interface ServeOptions {
		hostname?: string;
		port?: number;
		fetch?: (req: Request) => Response | Promise<Response>;
	}

	interface Server {
		port: number;
		stop(closeActiveConnections?: boolean): void;
	}

	function serve(options: ServeOptions): Server;
	function file(path: string): BunFile;

	interface BunFile extends Blob {
		exists(): Promise<boolean>;
		size: number;
	}
}

declare module "bun:sqlite" {
	export class Database {
		constructor(filename?: string, options?: { readonly?: boolean; create?: boolean; readwrite?: boolean });
		exec(sql: string): void;
		close(): void;
	}
}
