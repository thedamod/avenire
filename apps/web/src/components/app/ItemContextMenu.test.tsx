import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useLongPress } from "../../features/library/useSelection";
import { ItemContextMenu } from "./ItemContextMenu";

// Capture the wrapper's public event wiring without requiring a DOM/browser runtime.
const capture = vi.hoisted(() => ({ trigger: {} as Record<string, any> }));
vi.mock("@avenire/ui/components/context-menu", () => {
  const pass = ({ children }: { children: React.ReactNode }) => children;
  return {
    ContextMenu: pass,
    ContextMenuContent: pass,
    ContextMenuItem: pass,
    ContextMenuPortal: pass,
    ContextMenuSeparator: () => null,
    ContextMenuShortcut: pass,
    ContextMenuSub: pass,
    ContextMenuSubContent: pass,
    ContextMenuSubTrigger: pass,
    ContextMenuTrigger: (props: Record<string, any>) => {
      capture.trigger = props;
      return props.children;
    },
  };
});

function trigger(disabled = false) {
  renderToString(
    <ItemContextMenu actions={[{ label: "Select" }]} disabled={disabled}>
      <button>File</button>
    </ItemContextMenu>,
  );
  return capture.trigger;
}
function pointer(pointerType: string) {
  return {
    pointerType,
    clientX: 0,
    clientY: 0,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}
function LongPressRow({
  onSelect,
  report,
}: {
  onSelect: () => void;
  report: (value: ReturnType<typeof useLongPress>) => void;
}) {
  report(useLongPress(onSelect));
  return null;
}
function mountLongPress(onSelect: () => void) {
  let result: ReturnType<typeof useLongPress> | undefined;
  renderToString(
    <LongPressRow
      onSelect={onSelect}
      report={(value) => {
        result = value;
      }}
    />,
  );
  return result!;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("context menu input wiring", () => {
  it("lets the touch selection timer run while preventing Radix's pointerdown default", () => {
    vi.useFakeTimers();
    const select = vi.fn();
    const longPress = mountLongPress(select);
    const menu = trigger();
    const event = pointer("touch");
    menu.onPointerDownCapture(event);
    // Slot runs the child's handler before the trigger's handler.
    longPress.handlers.onPointerDown(event as React.PointerEvent);
    menu.onPointerDown(event);
    expect(event.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(700);
    expect(select).toHaveBeenCalledOnce();
    const context = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    menu.onContextMenu(context);
    expect(context.defaultPrevented).toBe(true);
    expect(longPress.consumeClick()).toBe(true);
    expect(longPress.consumeClick()).toBe(false);
  });
  it.each(["mouse", "pen"])("allows %s context menus without starting touch selection", (kind) => {
    vi.useFakeTimers();
    const select = vi.fn();
    const longPress = mountLongPress(select);
    vi.stubGlobal("document", { activeElement: null });
    const menu = trigger();
    const event = pointer(kind);
    menu.onPointerDownCapture(event);
    longPress.handlers.onPointerDown(event as React.PointerEvent);
    menu.onPointerDown(event);
    menu.onContextMenu(event);
    vi.advanceTimersByTime(700);
    expect(event.defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
  it("cancels long press when touch scrolls or ends", () => {
    vi.useFakeTimers();
    const select = vi.fn();
    const longPress = mountLongPress(select);
    longPress.handlers.onPointerDown(pointer("touch") as React.PointerEvent);
    longPress.handlers.onPointerMove({ clientX: 20, clientY: 0 } as React.PointerEvent);
    vi.advanceTimersByTime(700);
    longPress.handlers.onPointerDown(pointer("touch") as React.PointerEvent);
    longPress.handlers.onPointerUp();
    vi.advanceTimersByTime(700);
    expect(select).not.toHaveBeenCalled();
  });
  it.each([
    { key: "F10", shiftKey: true },
    { key: "ContextMenu", shiftKey: false },
  ])("opens at the focused row for $key", (key) => {
    vi.stubGlobal(
      "MouseEvent",
      class extends Event {
        clientX: number;
        clientY: number;
        constructor(type: string, init: MouseEventInit) {
          super(type, init);
          this.clientX = init.clientX!;
          this.clientY = init.clientY!;
        }
      },
    );
    const dispatchEvent = vi.fn();
    const event = {
      ...key,
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => ({ left: 20, bottom: 80 }), dispatchEvent },
    };
    const menu = trigger();
    menu.onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contextmenu",
        bubbles: true,
        cancelable: true,
        clientX: 32,
        clientY: 80,
      }),
    );
    trigger(true).onKeyDown(event);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
  it("keeps asChild and does not add a tab stop", () => {
    const menu = trigger();
    expect(menu.asChild).toBe(true);
    expect(menu.tabIndex).toBeUndefined();
    expect(menu.className).toContain("data-[state=open]:bg-hover");
  });
});
