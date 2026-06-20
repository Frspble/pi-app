"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/hooks/useI18n";

type TextControl = HTMLInputElement | HTMLTextAreaElement;

type EditableSnapshot =
  | {
      kind: "control";
      element: TextControl;
      start: number;
      end: number;
      selectedText: string;
      writable: boolean;
    }
  | {
      kind: "contenteditable";
      element: HTMLElement;
      range: Range | null;
      selectedText: string;
      writable: boolean;
    };

type MenuAction = {
  type: "action";
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
};

type MenuItem = MenuAction | { type: "separator"; id: string };

type MenuState = {
  x: number;
  y: number;
  items: MenuItem[];
};

function isTextControl(element: Element): element is TextControl {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return ["text", "search", "url", "tel", "email", "password"].includes(element.type);
}

function getEditableSnapshot(target: Element): EditableSnapshot | null {
  const editable = target.closest("input, textarea, [contenteditable='true']");
  if (!editable) return null;

  if (isTextControl(editable)) {
    const start = editable.selectionStart ?? 0;
    const end = editable.selectionEnd ?? start;
    return {
      kind: "control",
      element: editable,
      start,
      end,
      selectedText: editable.value.slice(start, end),
      writable: !editable.disabled && !editable.readOnly,
    };
  }
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) return null;

  if (!(editable instanceof HTMLElement)) return null;
  const selection = window.getSelection();
  const containsSelection = Boolean(
    selection?.rangeCount && selection.anchorNode && editable.contains(selection.anchorNode)
  );
  const range = containsSelection ? selection!.getRangeAt(0).cloneRange() : null;
  return {
    kind: "contenteditable",
    element: editable,
    range,
    selectedText: range?.toString() ?? "",
    writable: editable.isContentEditable,
  };
}

function restoreSelection(snapshot: EditableSnapshot) {
  snapshot.element.focus({ preventScroll: true });
  if (snapshot.kind === "control") {
    snapshot.element.setSelectionRange(snapshot.start, snapshot.end);
    return;
  }
  if (!snapshot.range) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(snapshot.range);
}

function dispatchInput(element: HTMLElement, inputType: string, data: string | null) {
  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType,
    data,
  }));
}

function replaceSelection(snapshot: EditableSnapshot, text: string, inputType: string) {
  restoreSelection(snapshot);
  if (snapshot.kind === "control") {
    snapshot.element.setRangeText(text, snapshot.start, snapshot.end, "end");
    dispatchInput(snapshot.element, inputType, text || null);
    return;
  }

  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : snapshot.range;
  if (!range) return;
  range.deleteContents();
  if (text) {
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
  }
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  dispatchInput(snapshot.element, inputType, text || null);
}

function selectEditableContents(snapshot: EditableSnapshot) {
  snapshot.element.focus({ preventScroll: true });
  if (snapshot.kind === "control") {
    snapshot.element.select();
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(snapshot.element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const writeClipboard = useCallback(async (text: string) => {
    await window.piDesktop?.writeClipboardText(text);
  }, []);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const desktop = window.piDesktop;
      if (!desktop) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const editable = getEditableSnapshot(target);
      const selectedText = editable?.selectedText || window.getSelection()?.toString() || "";
      const pathElement = target.closest<HTMLElement>("[data-context-file-path]");
      const filePath = pathElement?.dataset.contextFilePath;
      const shortcut = (key: string) => desktop.platform === "darwin" ? `⌘${key}` : `Ctrl+${key}`;
      const items: MenuItem[] = [];

      if (editable) {
        items.push(
          {
            type: "action",
            id: "cut",
            label: t("contextMenu.cut"),
            shortcut: shortcut("X"),
            disabled: !editable.writable || !editable.selectedText,
            run: async () => {
              if (!editable.selectedText) return;
              await writeClipboard(editable.selectedText);
              replaceSelection(editable, "", "deleteByCut");
            },
          },
          {
            type: "action",
            id: "copy",
            label: t("common.copy"),
            shortcut: shortcut("C"),
            disabled: !editable.selectedText,
            run: () => writeClipboard(editable.selectedText),
          },
          {
            type: "action",
            id: "paste",
            label: t("contextMenu.paste"),
            shortcut: shortcut("V"),
            disabled: !editable.writable,
            run: async () => {
              const text = await desktop.readClipboardText();
              replaceSelection(editable, text, "insertFromPaste");
            },
          },
          { type: "separator", id: "edit-separator" },
          {
            type: "action",
            id: "select-all",
            label: t("contextMenu.selectAll"),
            shortcut: shortcut("A"),
            run: () => selectEditableContents(editable),
          }
        );
      } else if (selectedText) {
        items.push({
          type: "action",
          id: "copy-selection",
          label: t("common.copy"),
          shortcut: shortcut("C"),
          run: () => writeClipboard(selectedText),
        });
      }

      if (filePath) {
        if (items.length > 0) items.push({ type: "separator", id: "file-separator" });
        items.push(
          {
            type: "action",
            id: "reveal-path",
            label: desktop.platform === "darwin"
              ? t("contextMenu.revealInFinder")
              : t("contextMenu.revealInExplorer"),
            run: async () => {
              await desktop.revealPath(filePath);
            },
          },
          {
            type: "action",
            id: "copy-path",
            label: t("contextMenu.copyPath"),
            run: () => writeClipboard(filePath),
          }
        );
      }

      if (items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setPosition({ x: event.clientX, y: event.clientY });
      setMenu({ x: event.clientX, y: event.clientY, items });
      setActiveIndex(items.findIndex((item) => item.type === "action" && !item.disabled));
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, [t, writeClipboard]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8));
    const y = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8));
    setPosition((current) => current.x === x && current.y === y ? current : { x, y });
  }, [menu]);

  const enabledIndexes = useMemo(() => {
    if (!menu) return [];
    return menu.items.flatMap((item, index) =>
      item.type === "action" && !item.disabled ? [index] : []
    );
  }, [menu]);

  const runItem = useCallback((item: MenuItem) => {
    if (item.type !== "action" || item.disabled) return;
    closeMenu();
    void Promise.resolve(item.run()).catch(() => {});
  }, [closeMenu]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && enabledIndexes.length > 0) {
        event.preventDefault();
        const current = enabledIndexes.indexOf(activeIndex);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (current + delta + enabledIndexes.length) % enabledIndexes.length;
        setActiveIndex(enabledIndexes[next]);
        return;
      }
      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        runItem(menu.items[activeIndex]);
      }
    };
    const close = () => closeMenu();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [activeIndex, closeMenu, enabledIndexes, menu, runItem]);

  return (
    <>
      {children}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("contextMenu.label")}
          className="no-window-drag"
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            zIndex: 2000,
            width: 190,
            padding: 4,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-panel)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
            color: "var(--text)",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
          onContextMenu={(event) => event.preventDefault()}
        >
          {menu.items.map((item, index) => item.type === "separator" ? (
            <div key={item.id} role="separator" style={{ height: 1, margin: "4px 6px", background: "var(--border)" }} />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => !item.disabled && setActiveIndex(index)}
              onClick={() => runItem(item)}
              style={{
                width: "100%",
                height: 30,
                padding: "0 9px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                border: "none",
                borderRadius: 5,
                background: activeIndex === index && !item.disabled ? "var(--bg-hover)" : "transparent",
                color: item.disabled ? "var(--text-dim)" : "var(--text)",
                cursor: item.disabled ? "default" : "pointer",
                font: "inherit",
                fontSize: 12,
                textAlign: "left",
                opacity: item.disabled ? 0.55 : 1,
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span style={{ color: "var(--text-dim)", fontSize: 10 }}>{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
