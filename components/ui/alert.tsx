export function Alert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger-surface px-4 py-3 text-sm text-danger"
    >
      {message}
    </div>
  );
}
