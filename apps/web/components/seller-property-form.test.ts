import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as formState from "../lib/seller-property-form";
import * as serviceAreaApi from "../lib/service-area-api";
import * as serviceAreas from "../lib/service-areas";

const nodeRequire = createRequire(import.meta.url);
const compile = (file: string) => ts.transpileModule(readFileSync(path.resolve(file), "utf8"), {
  compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const formSource = compile("components/seller-property-form.tsx");
const lookupSource = compile("components/property-address-lookup.tsx");

type FormModule = typeof import("./seller-property-form");
type LookupModule = typeof import("./property-address-lookup");

// Static rendering cannot submit, so seed the state an action returned.
function renderWithState(state: formState.SellerPropertyFormState, children: (form: FormModule, lookup: LookupModule) => ReactNode) {
  const react = nodeRequire("react") as typeof import("react");
  const seededReact = { ...react, useActionState: () => [state, () => undefined, false] };
  const form = { exports: {} as FormModule };
  new Function("require", "exports", formSource)((id: string) => (
    id === "react" ? seededReact
      : id === "../lib/seller-property-form" ? formState
        : id === "./icon" ? { Icon: () => null }
          : nodeRequire(id)
  ), form.exports);
  const lookup = { exports: {} as LookupModule };
  new Function("require", "exports", lookupSource)((id: string) => (
    id === "./seller-property-form" ? form.exports
      : id === "../lib/service-area-api" ? serviceAreaApi
        : id === "../lib/service-areas" ? serviceAreas
          : nodeRequire(id)
  ), lookup.exports);
  const Form = form.exports.SellerPropertyForm as ComponentType<{ action: () => Promise<formState.SellerPropertyFormState>; children?: ReactNode; className: string }>;
  return renderToStaticMarkup(createElement(
    Form,
    { action: async () => state, className: "seller-property-intake-form" },
    children(form.exports, lookup.exports),
  ));
}

const inputTag = (html: string, name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*/>`))?.[0] ?? "";

const failedState: formState.SellerPropertyFormState = {
  fieldErrors: {
    bathrooms: "Enter bathrooms as a whole number, like 2. Half baths can't be saved.",
    price: "Enter the asking price in dollars, like 925,000.",
  },
  message: "Check the highlighted fields and try again.",
};

describe("seller property form", () => {
  it("marks each failed field and links it to its message", () => {
    const html = renderWithState(failedState, (form, lookup) => [
      createElement(form.PropertyPriceField, { key: "price" }),
      createElement(lookup.PropertyAddressLookup, { key: "lookup", marketSlug: "los-angeles", marketState: "CA" }),
      createElement(form.SellerPropertyFormAlert, { key: "alert" }),
    ]);

    for (const field of ["price", "bathrooms"]) {
      expect(inputTag(html, field)).toContain('aria-invalid="true"');
      expect(inputTag(html, field)).toContain(`aria-describedby="${field}-error"`);
    }
    expect(html).toContain('<p class="field-error" id="price-error">Enter the asking price in dollars, like 925,000.</p>');
    expect(html).toContain("Half baths can&#x27;t be saved.");
    expect(inputTag(html, "bedrooms")).not.toContain("aria-invalid");
    expect(inputTag(html, "addressLine1")).toContain('aria-describedby="property-lookup-status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Check the highlighted fields and try again.");
  });

  it("renders a clean form before any submission", () => {
    const html = renderWithState(formState.initialSellerPropertyFormState, (form) => [
      createElement(form.PropertyPriceField, { defaultValue: 925000, key: "price" }),
      createElement(form.PropertyNotesField, { key: "notes" }),
      createElement(form.SellerPropertyFormAlert, { key: "alert" }),
    ]);

    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain('role="alert"');
    expect(html).toMatch(/<input[^>]*name="price"[^>]*value="925000"/);
    expect(html).toMatch(/<textarea[^>]*maxLength="2000"[^>]*name="description"/);
  });

  it("keeps what the seller entered when a save comes back with errors", () => {
    // React resets forms after an action returns; failures return state, successes redirect.
    expect(readFileSync(path.resolve("components/seller-property-form.tsx"), "utf8"))
      .toContain("onReset={(event) => event.preventDefault()}");
    for (const page of ["app/seller/properties/new/page.tsx", "app/seller/properties/[propertyId]/edit/page.tsx"]) {
      const source = readFileSync(path.resolve(page), "utf8");
      expect(source).toMatch(/<SellerPropertyForm action=\{submitSellerProperty(Update)?\}/);
      expect(source).not.toMatch(/<form action=\{submitSellerProperty/);
    }
  });
});
