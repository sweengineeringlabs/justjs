declare const _brand: unique symbol

export type Brand<B extends string>             = { readonly [_brand]: B }
export type Newtype<B extends string, T = string> = T & Brand<B>
