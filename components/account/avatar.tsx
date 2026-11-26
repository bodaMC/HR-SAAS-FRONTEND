/** Employee picture or initials. Pictures load through the authenticated same-origin BFF proxy only. */
export function Avatar({ src, name, size = 64 }: { src: string | null; name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} data-testid="avatar-img" className="shrink-0 rounded-full border border-border object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      data-testid="avatar-initials"
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-primary font-semibold text-white"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {initials || "?"}
    </span>
  );
}
