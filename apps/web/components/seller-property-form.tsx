"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import {
  initialSellerPropertyFormState,
  type SellerPropertyFormField,
  type SellerPropertyFormState,
} from "../lib/seller-property-form";
import { Icon } from "./icon";

type SellerPropertyAction = (state: SellerPropertyFormState, formData: FormData) => Promise<SellerPropertyFormState>;

const SellerPropertyFormContext = createContext<SellerPropertyFormState>(initialSellerPropertyFormState);

export function SellerPropertyForm({
  action,
  children,
  className,
}: {
  action: SellerPropertyAction;
  children: ReactNode;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialSellerPropertyFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state === initialSellerPropertyFormState) return;
    const form = formRef.current;
    const target = form?.querySelector<HTMLElement>("[aria-invalid=\"true\"]")
      ?? form?.querySelector<HTMLElement>(".seller-property-form-alert");
    target?.focus();
  }, [state]);

  return (
    // React resets forms when an action returns. Returned states are failures;
    // successful saves redirect, so keep everything the seller entered.
    <form
      action={formAction}
      aria-busy={pending}
      className={className}
      onReset={(event) => event.preventDefault()}
      ref={formRef}
    >
      <SellerPropertyFormContext value={state}>{children}</SellerPropertyFormContext>
    </form>
  );
}

export function SellerPropertyFormAlert() {
  const { message } = useContext(SellerPropertyFormContext);
  if (!message) return null;
  return (
    <div className="inline-alert danger seller-property-form-alert" role="alert" tabIndex={-1}>
      <Icon name="info" size={20} />
      <p><strong>Your property wasn&rsquo;t saved.</strong> {message}</p>
    </div>
  );
}

export function useSellerPropertyFieldErrors() {
  return useContext(SellerPropertyFormContext).fieldErrors ?? {};
}

/** Accessibility attributes linking a control to its inline validation message. */
export function fieldErrorProps(field: SellerPropertyFormField, error: string | undefined, describedBy?: string) {
  const ids = [describedBy, error ? fieldErrorId(field) : undefined].filter(Boolean).join(" ");
  return { "aria-describedby": ids || undefined, "aria-invalid": error ? true : undefined };
}

export function SellerPropertyFieldError({ field }: { field: SellerPropertyFormField }) {
  const error = useSellerPropertyFieldErrors()[field];
  return error ? <p className="field-error" id={fieldErrorId(field)}>{error}</p> : null;
}

export function PropertyPriceField({ defaultValue }: { defaultValue?: number | string }) {
  const error = useSellerPropertyFieldErrors().price;
  return (
    <div className="field">
      <label htmlFor="price">Asking price</label>
      <input
        {...fieldErrorProps("price", error)}
        defaultValue={defaultValue}
        id="price"
        inputMode="numeric"
        name="price"
        placeholder="925,000"
      />
      <SellerPropertyFieldError field="price" />
    </div>
  );
}

export function PropertyNotesField({ defaultValue, placeholder }: { defaultValue?: string; placeholder?: string }) {
  const error = useSellerPropertyFieldErrors().description;
  return (
    <div className="field full">
      <label htmlFor="description">Notes for invited buyers</label>
      <textarea
        {...fieldErrorProps("description", error)}
        defaultValue={defaultValue}
        id="description"
        maxLength={2000}
        name="description"
        placeholder={placeholder}
      />
      <SellerPropertyFieldError field="description" />
    </div>
  );
}

function fieldErrorId(field: SellerPropertyFormField) {
  return `${field}-error`;
}
