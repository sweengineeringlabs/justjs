declare const _brand: unique symbol

export type Newtype<B extends string, T = string> = T & { readonly [_brand]: B }
