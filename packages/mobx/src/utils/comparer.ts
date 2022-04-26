import { deepEqual } from "../internal"

export interface IEqualsComparer<T> {
    (a: T, b: T): boolean
}

/**
 * 引用比较
 */
function identityComparer(a: any, b: any): boolean {
    return a === b
}

/**
 * 深度比较
 */
function structuralComparer(a: any, b: any): boolean {
    return deepEqual(a, b)
}

/**
 * 浅比较
 */
function shallowComparer(a: any, b: any): boolean {
    return deepEqual(a, b, 1)
}

/**
 * Object.is比较
 */
function defaultComparer(a: any, b: any): boolean {
    if (Object.is) {
        return Object.is(a, b)
    }

    return a === b ? a !== 0 || 1 / a === 1 / b : a !== a && b !== b
}

export const comparer = {
    identity: identityComparer,
    structural: structuralComparer,
    default: defaultComparer,
    shallow: shallowComparer
}
