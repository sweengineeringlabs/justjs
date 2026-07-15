export interface ToggleOption {
  readonly value: string;
  readonly label: string;
}

export interface ToggleViewProps {
  readonly options?: readonly ToggleOption[];
  readonly activeValue?: string;
}
