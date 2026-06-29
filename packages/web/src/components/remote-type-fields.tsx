import type { RemoteTypeField } from "@drivehub/types";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/** Renders a catalog-driven set of fields into a params record. */
export function RemoteTypeFields({
  fields,
  values,
  onChange,
}: {
  fields: RemoteTypeField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-3.5">
      {fields.map((f) => {
        const id = `remote-field-${f.key}`;
        if (f.type === "boolean") {
          const checked = values[f.key] === "true";
          return (
            <div
              key={f.key}
              className="flex items-center justify-between gap-4"
            >
              <div className="space-y-0.5">
                <label
                  htmlFor={id}
                  className="text-[13px] font-medium text-foreground"
                >
                  {f.label}
                </label>
                {f.help && (
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                )}
              </div>
              <Switch
                id={id}
                checked={checked}
                onCheckedChange={(c) => onChange(f.key, c ? "true" : "false")}
              />
            </div>
          );
        }

        return (
          <Field
            key={f.key}
            label={f.label}
            htmlFor={id}
            hint={f.help}
            required={f.required}
          >
            <Input
              id={id}
              type={
                f.type === "password"
                  ? "password"
                  : f.type === "number"
                    ? "number"
                    : "text"
              }
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}
