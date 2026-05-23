export interface CliArgs {
	port?: number;
	host?: string;
	sessionsDir?: string;
	help?: boolean;
}

export function parseArgs(args: string[]): CliArgs {
	const result: CliArgs = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if ((arg === "--port" || arg === "-p") && i + 1 < args.length) {
			const port = parseInt(args[++i], 10);
			if (!Number.isNaN(port)) result.port = port;
		} else if ((arg === "--host" || arg === "-H") && i + 1 < args.length) {
			result.host = args[++i];
		} else if (arg === "--sessions-dir" && i + 1 < args.length) {
			result.sessionsDir = args[++i];
		}
	}

	return result;
}

export function printHelp(): void {
	console.log(`
pi-web - Web dashboard for Pi sessions

Usage:
  pi-web [options]

Options:
  -p, --port <number>       Port to listen on (default: 9393)
  -H, --host <address>      Host to bind to (default: 127.0.0.1)
      --sessions-dir <path> Custom sessions directory
  -h, --help                Show this help message

Examples:
  pi-web                    Start on http://127.0.0.1:9393
  pi-web --port 8080        Start on http://127.0.0.1:8080
  pi-web --host 0.0.0.0     Listen on all interfaces
`);
}
