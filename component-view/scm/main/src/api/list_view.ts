export interface ListItem {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface ListViewProps {
  readonly items?: readonly ListItem[];
  readonly emptyMessage?: string;
  readonly clickable?: boolean;
}
