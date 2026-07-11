// One shared FeatureStore for the whole app - boot() takes exactly one
// featureStore, so counter/login state live in the same slice-based
// shape a real app would use, not two separate stores.
export interface AppState {
  count: number;
  loggedIn: boolean;
  username: string | null;
}

export type AppAction =
  | { type: "increment" }
  | { type: "login"; username: string }
  | { type: "logout" };

export const initialState: AppState = {
  count: 0,
  loggedIn: false,
  username: null,
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + 1 };
    case "login":
      return { ...state, loggedIn: true, username: action.username };
    case "logout":
      return { ...state, loggedIn: false, username: null };
    default:
      return state;
  }
}
