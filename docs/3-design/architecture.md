# JustJS — Architecture

## Overview

JustJS is the UI domain layer. The developer writes a `*_component.yaml` and places an HTML tag. Everything else flows — routing, auth, state, API transport, lifecycle, CSS, observability, platform delivery.

**Core principle:** all wiring is declared at boot time by strategy name, resolved through SPI, never by direct import. Swap a strategy name; nothing else changes.

---

## Package structure

```mermaid
graph TD
  Core["@justjs/core\nDomain contracts · zero deps\nInterfaces only"]
  Browser["@justjs/browser\nBrowser runtime\nAll four layers + aspects"]
  Native["@justjs/native\niOS / Android\n(blocked: justweb#43)"]
  Mobile["@justjs/mobile\nCapacitor / React Native\n(blocked: justweb#43)"]
  Desktop["@justjs/desktop\nElectron / Tauri\n(blocked: justweb#43)"]

  Core --> Browser
  Core --> Native
  Core --> Mobile
  Core --> Desktop
```

---

## Layer model

```mermaid
flowchart LR
  subgraph layers[" "]
    direction LR
    N["Network\nfetch · WebSocket\nService Worker · Custom Elements"]
    T["Transport\nApiAdapter · WsAdapter\nCacheAdapter"]
    A["Application\nRouter · ComponentRegistry\nLifecycle · InteractionProxy"]
    D["Data\nFeatureStore · Signals\nUIEventBus"]
  end

  subgraph aspects["Aspects — woven across all layers via JustJS.boot()"]
    direction LR
    Sec[Security]
    Obs[Observability]
    I18n[i18n]
    Flags[Feature Flags]
    Ana[Analytics]
    Theme[Theming]
    Err[Error Handling]
    Custom["Custom SPI"]
  end

  N --> T --> A --> D
  D -.->|signals| A

  aspects -.->|weave| N
  aspects -.->|weave| T
  aspects -.->|weave| A
  aspects -.->|weave| D
```

---

## SAF — Service Abstraction Framework

Every package follows the same four-directory layout:

| Directory | Name | Role |
|---|---|---|
| `src/api/` | Contracts | Interfaces, errors, types — zero dependencies |
| `src/core/` | Implementations | Business logic — never imported by consumers |
| `src/saf/` | Service Abstraction Facade | Sole public export surface |
| `src/spi/` | Service Provider Implementation | Extension hooks — providers self-register |

Consumers import only from the SAF surface (`@justjs/core` or `@justjs/browser`). The `core/` implementations are an internal detail.

---

## Boot sequence

```mermaid
sequenceDiagram
  participant App as app.ts
  participant Boot as JustJS.boot()
  participant V as BootValidator
  participant SPI as AspectRegistry
  participant L as Layer wiring

  App->>Boot: boot(config)
  Boot->>V: validateBootConfig(config)
  V-->>Boot: BootError[]

  alt errors.length > 0
    Boot-->>App: throw BootError (UNKNOWN_ROUTE · UNKNOWN_COMPONENT · UNKNOWN_STRATEGY)
  end

  loop each declared aspect
    Boot->>SPI: resolve(concern, strategy)
    SPI-->>Boot: AspectProvider
    Boot->>SPI: provider.factory(config)
    SPI-->>Boot: JustJSAspect
    Boot->>Boot: aspect.weave(target)
  end

  Boot->>L: wire Network → Transport → Application → Data
  Boot-->>App: ready — app never starts in invalid state
```

---

## Component lifecycle

```mermaid
sequenceDiagram
  participant DOM
  participant Reg as ComponentRegistry
  participant LC as Lifecycle
  participant API as ApiAdapter
  participant Store as FeatureStore
  participant RT as RuntimeAdapter

  DOM->>Reg: connectedCallback (HTML tag placed)
  Reg->>LC: run(ctx)

  LC->>LC: ResolveStep
  LC->>API: get(featureId)
  API-->>LC: data
  LC->>Store: dispatch(ResolveAction)

  LC->>LC: MountStep
  Store-->>LC: Signal<State>

  LC->>LC: RenderStep
  LC->>RT: render(component, signals)
  RT-->>DOM: DOM update

  loop on every signal change
    Store-->>LC: signal updated
    LC->>LC: UpdateStep
    LC->>RT: render(component, signals)
    RT-->>DOM: DOM update
  end

  DOM->>Reg: disconnectedCallback
  Reg->>LC: UnmountStep
  LC->>RT: unmount(handle)
```

---

## User interaction data flow

```mermaid
sequenceDiagram
  participant User
  participant IP as InteractionProxy
  participant Router
  participant Bus as UIEventBus
  participant LC as Lifecycle
  participant Store as FeatureStore
  participant RT as RuntimeAdapter

  User->>IP: click · navigate · submit
  IP->>Router: navigate(url)
  Router->>Router: resolve(url) → RouteMatch
  Router-->>Router: current signal updated
  IP->>Bus: publish(InteractionEvent)
  Bus->>LC: trigger for matched component
  LC->>Store: dispatch(action)
  Store-->>LC: Signal updated
  LC->>RT: render(component, signals)
  RT-->>User: DOM updated
```

---

## Aspect weaving — SPI

```mermaid
flowchart TD
  Boot["JustJS.boot(config)"]
  AR["AspectRegistry\nSPI — providers self-register before boot()"]

  Boot -->|"security:\nstrategy: 'oauth'"| AR
  Boot -->|"observability:\nstrategy: 'datadog'"| AR
  Boot -->|"aspects[0]:\nstrategy: 'my-plugin'"| AR

  AR --> P1["OAuthProvider.factory()"]
  AR --> P2["DatadogProvider.factory()"]
  AR --> P3["MyPluginProvider.factory()"]

  P1 --> A1["OAuthAspect\n.weave({ on: ['/dashboard'] })"]
  P2 --> A2["DatadogAspect\n.weave({ all: true })"]
  P3 --> A3["MyPluginAspect\n.weave({ on: ['js-checkout'] })"]
```

---

## Interface inventory

### `@justjs/core`

| Interface | File | Layer |
|---|---|---|
| `Component<Props, State, Events>` | `api/component.ts` | Application |
| `ComponentContext` | `api/component.ts` | Application |
| `MountHandle` | `api/component.ts` | Application |
| `LifecycleStep`, `Lifecycle` | `api/lifecycle.ts` | Application |
| `LifecycleEvent`, `LifecycleEventType` | `api/lifecycle.ts` | Application |
| `Signal<T>`, `WritableSignal<T>` | `api/store.ts` | Data |
| `FeatureStore<T, Selector>` | `api/store.ts` | Data |
| `Action`, `UIEventBus`, `UIEvent` | `api/store.ts` | Data |
| `Principal`, `UISecurityContext` | `api/security.ts` | Cross-cutting |
| `RouteGuard` | `api/security.ts` | Cross-cutting |
| `Route`, `RouteMatch`, `Router` | `api/router.ts` | Application |
| `ComponentRegistry` | `api/router.ts` | Application |
| `InteractionProxy`, `InteractionEvent` | `api/router.ts` | Application |
| `ApiAdapter` | `api/transport.ts` | Transport |
| `WsAdapter`, `WsConnection` | `api/transport.ts` | Transport |
| `CacheAdapter` | `api/transport.ts` | Transport |
| `RuntimeAdapter` | `api/runtime.ts` | Network |
| `UIObserverContext`, `LogDrain` | `api/observer.ts` | Cross-cutting |
| `I18nContext` | `api/i18n.ts` | Cross-cutting |
| `FlagsContext` | `api/flags.ts` | Cross-cutting |
| `ErrorBoundary`, `ComponentErrorPhase` | `api/error_boundary.ts` | Cross-cutting |
| `JustJSAspect`, `AspectProvider` | `api/aspect.ts` | SPI |
| `AspectRegistry` | `api/aspect.ts` | SPI |
| `AspectTarget`, `AspectConfig`, `AspectDeclaration` | `api/aspect.ts` | SPI |
| `BootConfig`, `BootError` | `api/boot.ts` | Boot |
| `RoutesManifest`, `RegistryManifest`, `ImportMap` | `api/boot.ts` | Boot |
