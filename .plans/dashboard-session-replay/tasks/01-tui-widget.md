# T-001: TUI Widget de Dashboard

**Phase**: widget
**Dependencies**: none
**Requirements**: FR-001

## Objective

Create a TUI widget that shows the dashboard URL and status, similar to the existing Lion subagent widget.

## Design

```
┌─ Dashboard ──────────────────────────────┐
│ ● http://localhost:9393 · 2 subagents    │
└──────────────────────────────────────────┘
```

## Implementation

### `packages/extensions/src/extensions/lion/ui/dashboard-widget.ts` (NEW)

```typescript
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Component, Container, Text } from "@earendil-works/pi-tui";
import type { LionRuntime } from "../runtime.js";

const LION_DASHBOARD_WIDGET_KEY = "lion-dashboard";
const WIDGET_REFRESH_MS = 1000;

export function renderDashboardWidget(runtime: LionRuntime, ctx?: ExtensionContext): void {
  const uiContext = ctx?.hasUI ? ctx : runtime.lastUiContext;
  if (!uiContext?.hasUI) return;
  
  const dashboard = runtime.dashboard;
  if (!dashboard?.isRunning) {
    uiContext.ui.setWidget(LION_DASHBOARD_WIDGET_KEY, undefined);
    return;
  }
  
  runtime.lastUiContext = uiContext;
  
  uiContext.ui.setWidget(LION_DASHBOARD_WIDGET_KEY, buildWidgetComponent(runtime));
  requestRender(uiContext);
}

function buildWidgetComponent(runtime: LionRuntime): (_tui: unknown, theme: Theme) => Component {
  return (_tui, theme) => {
    const container = new Container();
    const dashboard = runtime.dashboard;
    const url = dashboard?.url?.href ?? "not running";
    const subagentCount = runtime.subagentUi.size;
    
    const line = `${theme.fg("accent", "●")} ${theme.fg("toolTitle", theme.bold("Dashboard"))} ${theme.fg("dim", "·")} ${theme.fg("link", url)} ${subagentCount > 0 ? theme.fg("dim", `· ${subagentCount} subagents`) : ""}`;
    
    container.addChild(new Text(line, 1, 0));
    return container;
  };
}

function requestRender(ctx: ExtensionContext): void {
  (ctx.ui as { requestRender?: () => void }).requestRender?.();
}
```

### Update `index.ts`

```typescript
import { renderDashboardWidget } from "./ui/dashboard-widget.js";

// In session_start handler:
pi.on("session_start", async (_event, ctx) => {
  restore(ctx);
  dashboardBridge.start();
  renderDashboardWidget(runtime, ctx);
});

// In dashboard command handler:
pi.registerCommand("dashboard", {
  handler: async (args, ctx) => {
    // ... start/stop dashboard ...
    renderDashboardWidget(runtime, ctx);
  },
});
```

## Verification

- Widget appears when Lion is activated and dashboard is running
- Widget shows correct URL
- Widget updates when subagent count changes
- Widget disappears when dashboard stops
- Clicking URL opens browser (or copies to clipboard)
