export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastStackProps = {
  items: ToastItem[];
  onDismiss: (id: string) => void;
};

const ToastStack = ({ items, onDismiss }: ToastStackProps) => {
  return (
    <div className="toast-stack">
      {items.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => onDismiss(toast.id)}>
            x
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
