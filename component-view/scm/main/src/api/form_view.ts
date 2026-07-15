export interface FormField {
  readonly id: string;
  readonly type: "text" | "password";
  readonly placeholder: string;
  // Pre-fills the input - a real need discovered migrating Jira's OAuth
  // app Client ID/Secret (justjs#125): unlike every other field in this
  // package (a write-only secret, e.g. a bearer token, never echoed
  // back), Jira's own app credentials are reasonable to show back to a
  // returning user for convenience. Omitted (undefined) renders an
  // empty input, matching every existing field's own behavior exactly.
  readonly defaultValue?: string;
}

export interface FormViewProps {
  readonly fields?: readonly FormField[];
  readonly connecting?: boolean;
  readonly connected?: boolean;
}
