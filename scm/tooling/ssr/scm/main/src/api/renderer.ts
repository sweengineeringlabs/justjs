export interface ComponentDefinition {
  renderShadowDom(props: ComponentProps): string
}

export interface ComponentProps {
  [key: string]: unknown
}

export interface SSRConfig {
  declarativeShadowDom?: boolean
  preloadResources?: string[]
}

export interface RenderResult {
  html: string
  hydrationScript: string
}

export interface HydrationData {
  component: string
  props: ComponentProps
}
