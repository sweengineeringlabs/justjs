declare const _newtypeBrand: unique symbol

export type Newtype<T, Brand> = T & { readonly [_newtypeBrand]: Brand }
