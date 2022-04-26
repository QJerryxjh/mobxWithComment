import { ObservableObjectAdministration, isFunction } from "../internal"

export const enum MakeResult {
    Cancel,
    Break,
    Continue
}

export type Annotation = {
    annotationType_: string
    make_(
        adm: ObservableObjectAdministration,
        key: PropertyKey,
        descriptor: PropertyDescriptor,
        source: object
    ): MakeResult
    extend_(
        adm: ObservableObjectAdministration,
        key: PropertyKey,
        descriptor: PropertyDescriptor,
        proxyTrap: boolean
    ): boolean | null
    options_?: any
}

export type AnnotationMapEntry =
    | Annotation
    | true /* follow the default decorator, usually deep */
    | false /* don't decorate this property */

// AdditionalFields can be used to declare additional keys that can be used, for example to be able to
// declare annotations for private/ protected members, see #2339
export type AnnotationsMap<T, AdditionalFields extends PropertyKey> = {
    [P in Exclude<keyof T, "toString">]?: AnnotationMapEntry
} & Record<AdditionalFields, AnnotationMapEntry>

/**
 * 判断是否为注解
 * @param thing 需要判断的值
 * @returns
 */
export function isAnnotation(thing: any) {
    // 满足条件: 是对象或者是函数,并且其上有键为annotationType_的字符串值,且有make_函数和extend_函数
    return (
        // Can be function
        thing instanceof Object &&
        typeof thing.annotationType_ === "string" &&
        isFunction(thing.make_) &&
        isFunction(thing.extend_)
    )
}

export function isAnnotationMapEntry(thing: any) {
    return typeof thing === "boolean" || isAnnotation(thing)
}
