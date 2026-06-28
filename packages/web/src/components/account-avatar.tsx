import { useState } from "react";
import { cn } from "@/lib/utils";

function initials(email: string, name: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return email.slice(0, 2).toUpperCase();
}

export function AccountAvatar({
  email,
  name,
  picture,
  size = 36,
  className,
}: {
  email: string;
  name: string | null;
  picture: string | null;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = picture && !errored;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent-muted text-accent",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {showImage ? (
        <img
          src={picture}
          alt={name ?? email}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-semibold uppercase">
          {initials(email, name)}
        </span>
      )}
    </span>
  );
}
