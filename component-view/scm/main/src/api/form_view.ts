export interface FormField {
  readonly id: string;
  readonly type: "text" | "password";
  readonly placeholder: string;
}

export interface FormViewProps {
  readonly fields?: readonly FormField[];
  readonly connecting?: boolean;
  readonly connected?: boolean;
}
