import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";

// A dummy login - no real auth, no network call, just client-side
// non-empty validation dispatching into the same shared FeatureStore the
// counter uses. Exists to prove a real <form> (inputs, submit,
// preventDefault, validation-error display) works identically through
// the same DDAS mount/reactive-render pipeline as the other components,
// on both targets.
export class LoginElement extends HTMLElement {
  private unsubscribe?: () => void;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    const store = ctx?.store;

    const render = () => {
      const state = store?.state.value;
      if (state?.loggedIn) {
        this.innerHTML = `
          <p class="login-welcome">Welcome, ${state.username}</p>
          <button id="logout">log out</button>
        `;
        this.querySelector("#logout")?.addEventListener("click", () => {
          store?.dispatch({ type: "logout" });
        });
        return;
      }

      this.innerHTML = `
        <form id="login-form">
          <input id="login-username" type="text" placeholder="username" autocomplete="off" />
          <input id="login-password" type="password" placeholder="password" autocomplete="off" />
          <p class="login-error" id="login-error"></p>
          <button id="login-submit" type="submit">log in</button>
        </form>
      `;
      this.querySelector("#login-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = (this.querySelector("#login-username") as HTMLInputElement).value.trim();
        const password = (this.querySelector("#login-password") as HTMLInputElement).value;
        const errorEl = this.querySelector("#login-error")!;
        if (!username || !password) {
          errorEl.textContent = "username and password are both required";
          return;
        }
        errorEl.textContent = "";
        store?.dispatch({ type: "login", username });
      });
    };

    render();
    this.unsubscribe = store?.subscribe(render);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-login")) {
  customElements.define("x-login", LoginElement);
}
