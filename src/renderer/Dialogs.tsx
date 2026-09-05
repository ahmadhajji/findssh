import { useEffect, useRef, useState, type ReactNode } from "react";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export function InputDialog({
  title,
  label,
  initial = "",
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}): ReactNode {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value);
        }}
      >
        <label>
          {label}
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            required
          />
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!value.trim()}>
            Continue
          </button>
        </footer>
      </form>
    </Modal>
  );
}
