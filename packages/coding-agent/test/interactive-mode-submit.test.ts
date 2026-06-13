import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";

type SubmitHandlerContext = {
	defaultEditor: { onSubmit?: (text: string) => Promise<void> };
	editor: { setText: (text: string) => void; addToHistory: (text: string) => void };
	session: {
		isBashRunning: boolean;
		isCompacting: boolean;
		isStreaming: boolean;
		prompt: (text: string, options?: { streamingBehavior: "steer" }) => Promise<void>;
	};
	onInputCallback?: (text: string) => void;
	showError: (message: string) => void;
	flushPendingBashComponents: () => void;
	submitPromptDirectly: (text: string) => Promise<void>;
	isExtensionCommand: (text: string) => boolean;
	queueCompactionMessage: (text: string, mode: "steer") => void;
	updatePendingMessagesDisplay: () => void;
	ui: { requestRender: () => void };
	showSettingsSelector: () => void;
	showModelsSelector: () => Promise<void>;
	handleModelCommand: (searchTerm?: string) => Promise<void>;
	handleExportCommand: (text: string) => Promise<void>;
	handleImportCommand: (text: string) => Promise<void>;
	handleShareCommand: () => Promise<void>;
	handleCopyCommand: () => Promise<void>;
	handleNameCommand: (text: string) => void;
	handleSessionCommand: () => void;
	handleChangelogCommand: () => void;
	handleHotkeysCommand: () => void;
	showUserMessageSelector: () => void;
	handleCloneCommand: () => Promise<void>;
	showTreeSelector: () => void;
	showOAuthSelector: (mode: "login" | "logout") => void;
	handleClearCommand: () => Promise<void>;
	handleCompactCommand: (customInstructions?: string) => Promise<void>;
	handleReloadCommand: () => Promise<void>;
	handleDebugCommand: () => void;
	handleArminSaysHi: () => void;
	handleDementedDelves: () => void;
	showSessionSelector: () => void;
	shutdown: () => Promise<void>;
	showWarning: (message: string) => void;
	handleBashCommand: (command: string, isExcluded: boolean) => Promise<void>;
	isBashMode: boolean;
	updateEditorBorderColor: () => void;
};

type InteractiveModePrototype = {
	setupEditorSubmitHandler(this: SubmitHandlerContext): void;
	submitPromptDirectly(this: SubmitHandlerContext, text: string): Promise<void>;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrototype;

function createSubmitHandlerContext(overrides: Partial<SubmitHandlerContext> = {}): SubmitHandlerContext {
	const prompt = vi.fn(async () => {});
	const context: SubmitHandlerContext = {
		defaultEditor: {},
		editor: { setText: vi.fn(), addToHistory: vi.fn() },
		session: {
			isBashRunning: false,
			isCompacting: false,
			isStreaming: false,
			prompt,
		},
		showError: vi.fn(),
		flushPendingBashComponents: vi.fn(),
		submitPromptDirectly: interactiveModePrototype.submitPromptDirectly,
		isExtensionCommand: () => false,
		queueCompactionMessage: vi.fn(),
		updatePendingMessagesDisplay: vi.fn(),
		ui: { requestRender: vi.fn() },
		showSettingsSelector: vi.fn(),
		showModelsSelector: vi.fn(async () => {}),
		handleModelCommand: vi.fn(async () => {}),
		handleExportCommand: vi.fn(async () => {}),
		handleImportCommand: vi.fn(async () => {}),
		handleShareCommand: vi.fn(async () => {}),
		handleCopyCommand: vi.fn(async () => {}),
		handleNameCommand: vi.fn(),
		handleSessionCommand: vi.fn(),
		handleChangelogCommand: vi.fn(),
		handleHotkeysCommand: vi.fn(),
		showUserMessageSelector: vi.fn(),
		handleCloneCommand: vi.fn(async () => {}),
		showTreeSelector: vi.fn(),
		showOAuthSelector: vi.fn(),
		handleClearCommand: vi.fn(async () => {}),
		handleCompactCommand: vi.fn(async () => {}),
		handleReloadCommand: vi.fn(async () => {}),
		handleDebugCommand: vi.fn(),
		handleArminSaysHi: vi.fn(),
		handleDementedDelves: vi.fn(),
		showSessionSelector: vi.fn(),
		shutdown: vi.fn(async () => {}),
		showWarning: vi.fn(),
		handleBashCommand: vi.fn(async () => {}),
		isBashMode: false,
		updateEditorBorderColor: vi.fn(),
		...overrides,
	};
	return context;
}

describe("InteractiveMode submit handler", () => {
	it("submits directly when idle but no input callback is installed", async () => {
		const context = createSubmitHandlerContext();

		interactiveModePrototype.setupEditorSubmitHandler.call(context);
		await context.defaultEditor.onSubmit?.(" next message ");

		expect(context.flushPendingBashComponents).toHaveBeenCalledTimes(1);
		expect(context.editor.setText).toHaveBeenCalledWith("");
		expect(context.session.prompt).toHaveBeenCalledWith("next message");
		expect(context.editor.addToHistory).toHaveBeenCalledWith("next message");
		expect(context.showError).not.toHaveBeenCalled();
	});

	it("uses the input callback when it is installed", async () => {
		const onInputCallback = vi.fn();
		const context = createSubmitHandlerContext({ onInputCallback });

		interactiveModePrototype.setupEditorSubmitHandler.call(context);
		await context.defaultEditor.onSubmit?.("normal message");

		expect(context.editor.setText).toHaveBeenCalledWith("");
		expect(onInputCallback).toHaveBeenCalledWith("normal message");
		expect(context.session.prompt).not.toHaveBeenCalled();
		expect(context.editor.addToHistory).toHaveBeenCalledWith("normal message");
	});

	it("clears editor before calling session.prompt in direct submit", async () => {
		const context = createSubmitHandlerContext();
		const promptOrder: string[] = [];
		context.session.prompt = vi.fn(async () => {
			promptOrder.push("prompt");
		});
		context.editor.setText = vi.fn((text: string) => {
			promptOrder.push(`setText:${text}`);
		});

		interactiveModePrototype.setupEditorSubmitHandler.call(context);
		await context.defaultEditor.onSubmit?.("test message");

		expect(promptOrder[0]).toBe("setText:");
		expect(promptOrder[1]).toBe("prompt");
	});

	it("clears editor before calling onInputCallback", async () => {
		const onInputCallback = vi.fn();
		const context = createSubmitHandlerContext({ onInputCallback });
		const callOrder: string[] = [];
		context.editor.setText = vi.fn((text: string) => {
			callOrder.push(`setText:${text}`);
		});
		context.onInputCallback = (text: string) => {
			callOrder.push(`callback:${text}`);
		};

		interactiveModePrototype.setupEditorSubmitHandler.call(context);
		await context.defaultEditor.onSubmit?.("test message");

		expect(callOrder[0]).toBe("setText:");
		expect(callOrder[1]).toBe("callback:test message");
	});

	it("shows error when direct submit fails", async () => {
		const context = createSubmitHandlerContext();
		context.session.prompt = vi.fn(async () => {
			throw new Error("API key invalid");
		});

		interactiveModePrototype.setupEditorSubmitHandler.call(context);
		await context.defaultEditor.onSubmit?.("failing message");

		expect(context.editor.setText).toHaveBeenCalledWith("");
		expect(context.showError).toHaveBeenCalledWith("API key invalid");
		expect(context.editor.addToHistory).toHaveBeenCalledWith("failing message");
	});

	it("shows generic error when direct submit throws non-Error", async () => {
		const context = createSubmitHandlerContext();
		context.session.prompt = vi.fn(async () => {
			throw "string error";
		});

		interactiveModePrototype.setupEditorSubmitHandler.call(context);
		await context.defaultEditor.onSubmit?.("failing message");

		expect(context.showError).toHaveBeenCalledWith("Unknown error occurred");
	});
});
