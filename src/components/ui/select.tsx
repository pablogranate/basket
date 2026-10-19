"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
  group: string | null;
};

type SelectProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "defaultValue" | "onChange" | "type" | "name" | "form"
> &
  Pick<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    "value" | "defaultValue" | "onChange" | "name" | "form" | "required" | "autoComplete"
  > & {
    defaultOpen?: boolean;
  };

type PopoverPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const POPOVER_GAP = 6;
const POPOVER_MAX_HEIGHT = 288;
const TYPEAHEAD_RESET_MS = 700;

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

function collectOptions(
  children: React.ReactNode,
  group: string | null = null,
  options: SelectOption[] = [],
) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (child.type === React.Fragment) {
      collectOptions(
        (child.props as { children?: React.ReactNode }).children,
        group,
        options,
      );
      return;
    }

    if (child.type === "optgroup") {
      const props = child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>;
      collectOptions(props.children, props.label ?? null, options);
      return;
    }

    if (child.type === "option") {
      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      const label = textOf(props.children).trim();
      options.push({
        value: props.value != null ? String(props.value) : label,
        label,
        disabled: Boolean(props.disabled),
        group,
      });
    }
  });

  return options;
}

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function computePosition(trigger: HTMLElement): PopoverPosition {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP * 2;
  const spaceAbove = rect.top - POPOVER_GAP * 2;
  const width = Math.max(rect.width, 180);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

  if (spaceBelow < 200 && spaceAbove > spaceBelow) {
    return {
      left,
      width,
      bottom: window.innerHeight - rect.top + POPOVER_GAP,
      maxHeight: Math.min(POPOVER_MAX_HEIGHT, spaceAbove),
    };
  }

  return {
    left,
    width,
    top: rect.bottom + POPOVER_GAP,
    maxHeight: Math.min(POPOVER_MAX_HEIGHT, spaceBelow),
  };
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  name,
  required,
  form,
  autoComplete,
  disabled,
  autoFocus,
  defaultOpen = false,
  onKeyDown,
  onBlur,
  ...buttonProps
}: SelectProps) {
  const options = React.useMemo(() => collectOptions(children), [children]);
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue != null ? String(defaultValue) : undefined,
  );
  const currentValue = isControlled ? String(value) : uncontrolledValue;
  const selectedOption =
    options.find((option) => option.value === currentValue) ??
    options.find((option) => !option.disabled);

  const [open, setOpen] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [position, setPosition] = React.useState<PopoverPosition | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const typeaheadRef = React.useRef({ query: "", timeout: 0 });
  const listboxId = React.useId();

  const openList = React.useCallback(
    (index?: number) => {
      if (!triggerRef.current) return;
      const selectedIndex = options.findIndex(
        (option) => option.value === selectedOption?.value,
      );
      setActiveIndex(index ?? Math.max(0, selectedIndex));
      setPosition(computePosition(triggerRef.current));
      setOpen(true);
    },
    [options, selectedOption],
  );

  const closeList = React.useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  function pick(option: SelectOption) {
    if (option.disabled) return;
    closeList();

    const select = selectRef.current;
    if (!select || select.value === option.value) return;

    const setNativeValue = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setNativeValue?.call(select, option.value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveActive(from: number, step: 1 | -1) {
    for (
      let index = from + step;
      index >= 0 && index < options.length;
      index += step
    ) {
      if (!options[index].disabled) return index;
    }
    return from;
  }

  function findByTypeahead(key: string) {
    const typeahead = typeaheadRef.current;
    window.clearTimeout(typeahead.timeout);
    typeahead.query += normalizeKey(key);
    typeahead.timeout = window.setTimeout(() => {
      typeahead.query = "";
    }, TYPEAHEAD_RESET_MS);
    return options.findIndex(
      (option) =>
        !option.disabled && normalizeKey(option.label).startsWith(typeahead.query),
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " && typeaheadRef.current.query) {
      event.preventDefault();
      const index = findByTypeahead(event.key);
      if (index >= 0) setActiveIndex(index);
      return;
    }

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const index = findByTypeahead(event.key);
        if (index >= 0) openList(index);
        return;
      }
      onKeyDown?.(event);
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => moveActive(index, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => moveActive(index, -1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(moveActive(-1, 1));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(moveActive(options.length, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options[activeIndex]) pick(options[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeList();
        break;
      case "Tab":
        closeList(false);
        break;
      default:
        if (event.key.length === 1) {
          const index = findByTypeahead(event.key);
          if (index >= 0) setActiveIndex(index);
        }
    }
  }

  React.useEffect(() => {
    if (autoFocus || defaultOpen) triggerRef.current?.focus();
    if (defaultOpen) openList();
    // Only on mount, like the native autoFocus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (isControlled) return;
    const formElement = selectRef.current?.form;
    if (!formElement) return;

    function handleReset() {
      window.setTimeout(() => setUncontrolledValue(selectRef.current?.value));
    }

    formElement.addEventListener("reset", handleReset);
    return () => formElement.removeEventListener("reset", handleReset);
  }, [isControlled]);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (triggerRef.current?.contains(event.target as Node)) return;
      closeList(false);
    }

    function handleViewportChange(event: Event) {
      if (listRef.current?.contains(event.target as Node)) return;
      if (triggerRef.current) setPosition(computePosition(triggerRef.current));
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open, closeList]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const isPlaceholder = !selectedOption || selectedOption.value === "";
  const groupHeaders = options.map((option, index) =>
    option.group && option.group !== options[index - 1]?.group ? option.group : null,
  );

  return (
    <>
      <button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (open) closeList(false);
          onBlur?.(event);
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-left text-sm text-[var(--foreground)] outline-none transition hover:border-[var(--n-300)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-[rgba(230,18,56,0.08)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-[var(--border)]",
          className,
          invalid && "border-[var(--accent)] bg-[var(--accent-soft)]",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isPlaceholder && "text-[var(--n-500)]",
          )}
        >
          {selectedOption?.label ?? ""}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-[var(--n-500)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <select
        ref={selectRef}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          if (!isControlled) setUncontrolledValue(event.target.value);
          setInvalid(false);
          onChange?.(event);
        }}
        onInvalid={() => setInvalid(true)}
        required={required}
        form={form}
        autoComplete={autoComplete}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      >
        {children}
      </select>
      {open && position
        ? createPortal(
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              // Keeps focus on the trigger and hides the click from the outside-click
              // handlers of the popovers and modals this select lives in.
              onMouseDown={(event) => {
                event.preventDefault();
                event.nativeEvent.stopImmediatePropagation();
              }}
              style={{
                left: position.left,
                width: position.width,
                top: position.top,
                bottom: position.bottom,
                maxHeight: position.maxHeight,
              }}
              className="fixed z-[400] overflow-y-auto overscroll-contain rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 text-sm text-[var(--foreground)] shadow-[var(--shadow-lift)]"
            >
              {options.map((option, index) => {
                const groupHeader = groupHeaders[index];
                const isSelected = option.value === selectedOption?.value;

                return (
                  <React.Fragment key={`${option.group ?? ""}-${option.value}-${index}`}>
                    {groupHeader ? (
                      <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--n-400)]">
                        {groupHeader}
                      </div>
                    ) : null}
                    <div
                      id={`${listboxId}-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      onMouseMove={() => {
                        if (!option.disabled && activeIndex !== index) {
                          setActiveIndex(index);
                        }
                      }}
                      onClick={() => pick(option)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-2",
                        index === activeIndex && "bg-[var(--n-100)]",
                        isSelected && "font-semibold text-[var(--accent-strong)]",
                        option.value === "" && !isSelected && "text-[var(--n-500)]",
                        option.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="min-w-0 flex-1">{option.label}</span>
                      {isSelected ? (
                        <Check aria-hidden className="size-4 shrink-0 text-[var(--accent)]" />
                      ) : null}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
