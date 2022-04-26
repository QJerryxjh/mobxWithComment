import { globalState, die } from "../internal"

// We shorten anything used > 5 times
export const assign = Object.assign
export const getDescriptor = Object.getOwnPropertyDescriptor
export const defineProperty = Object.defineProperty
export const objectPrototype = Object.prototype

export const EMPTY_ARRAY = []
Object.freeze(EMPTY_ARRAY)

export const EMPTY_OBJECT = {}
Object.freeze(EMPTY_OBJECT)

/**
 * 具名,可调用
 */
export interface Lambda {
    (): void
    name?: string
}

const hasProxy = typeof Proxy !== "undefined"
const plainObjectString = Object.toString()

/**
 * 查看是否有Proxy可用
 */
export function assertProxies() {
    if (!hasProxy) {
        die(
            __DEV__
                ? "`Proxy` objects are not available in the current environment. Please configure MobX to enable a fallback implementation.`"
                : "Proxy not available"
        )
    }
}

/**
 * 警告proxy的需求信息
 */
export function warnAboutProxyRequirement(msg: string) {
    if (__DEV__ && globalState.verifyProxies) {
        // 只在开发环境并且useProxy配置为ifavailable
        die(
            "MobX is currently configured to be able to run in ES5 mode, but in ES5 MobX won't be able to " +
                msg
        )
    }
}

export function getNextId() {
    return ++globalState.mobxGuid
}

/**
 * Makes sure that the provided function is invoked at most once.
 * 包裹函数只会被调用一次
 */
export function once(func: Lambda): Lambda {
    let invoked = false
    return function () {
        if (invoked) {
            return
        }
        invoked = true
        return (func as any).apply(this, arguments)
    }
}

/**
 * 空操作
 */
export const noop = () => {}

export function isFunction(fn: any): fn is Function {
    return typeof fn === "function"
}

export function isString(value: any): value is string {
    return typeof value === "string"
}

/**
 * 这样的值可以作为对象的key
 */
export function isStringish(value: any): value is string | number | symbol {
    const t = typeof value
    switch (t) {
        case "string":
        case "symbol":
        case "number":
            return true
    }
    return false
}

export function isObject(value: any): value is Object {
    return value !== null && typeof value === "object"
}

/**
 * 是否是普通对象
 * @param value 需要判断的对象
 * @returns boolean值
 */
export function isPlainObject(value: any) {
    if (!isObject(value)) {
        return false
    }
    const proto = Object.getPrototypeOf(value)
    if (proto == null) {
        return true
    }
    const protoConstructor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor
    return (
        typeof protoConstructor === "function" && protoConstructor.toString() === plainObjectString
    )
}

// https://stackoverflow.com/a/37865170
export function isGenerator(obj: any): boolean {
    const constructor = obj?.constructor
    if (!constructor) {
        return false
    }
    if (
        "GeneratorFunction" === constructor.name ||
        "GeneratorFunction" === constructor.displayName
    ) {
        return true
    }
    return false
}

/**
 * 添加隐藏属性(此处的隐藏指不可枚举)
 */
export function addHiddenProp(object: any, propName: PropertyKey, value: any) {
    defineProperty(object, propName, {
        enumerable: false,
        writable: true,
        configurable: true,
        value
    })
}

/**
 * 添加隐藏且不可赋值的属性
 */
export function addHiddenFinalProp(object: any, propName: PropertyKey, value: any) {
    defineProperty(object, propName, {
        enumerable: false,
        writable: false,
        configurable: true,
        value
    })
}

/**
 * 返回一个函数,用于判断是否为包装的构造函数的实例
 * @param name 名称,在构造函数原型上加判断标识的key
 * @param theClass 构造函数
 * @returns 用于判断变量是否为 @param theClass 的实例
 */
export function createInstanceofPredicate<T>(
    name: string,
    theClass: new (...args: any[]) => T
): (x: any) => x is T {
    const propName = "isMobX" + name
    theClass.prototype[propName] = true
    return function (x) {
        return isObject(x) && x[propName] === true
    } as any
}

export function isES6Map(thing: any): thing is Map<any, any> {
    return thing instanceof Map
}

export function isES6Set(thing: any): thing is Set<any> {
    return thing instanceof Set
}

const hasGetOwnPropertySymbols = typeof Object.getOwnPropertySymbols !== "undefined"

/**
 * 返回对象的keys,包括类型为Symbol的key(可枚举)
 *
 * Returns the following: own enumerable keys and symbols.
 */
export function getPlainObjectKeys(object: any) {
    const keys = Object.keys(object)
    // Not supported in IE, so there are not going to be symbol props anyway...
    if (!hasGetOwnPropertySymbols) {
        return keys
    }
    const symbols = Object.getOwnPropertySymbols(object)
    if (!symbols.length) {
        return keys
    }
    return [...keys, ...symbols.filter(s => objectPrototype.propertyIsEnumerable.call(object, s))]
}

/**
 * 返回对象的keys,包括不可枚举值
 * From Immer utils
 * Returns all own keys, including non-enumerable and symbolic
 */
export const ownKeys: (target: any) => Array<string | symbol> =
    typeof Reflect !== "undefined" && Reflect.ownKeys
        ? Reflect.ownKeys
        : hasGetOwnPropertySymbols
        ? obj => Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj) as any)
        : /* istanbul ignore next */ Object.getOwnPropertyNames

export function stringifyKey(key: any): string {
    if (typeof key === "string") {
        return key
    }
    if (typeof key === "symbol") {
        return key.toString()
    }
    return new String(key).toString()
}

/**
 * 转换为原始值
 */
export function toPrimitive(value: any) {
    return value === null ? null : typeof value === "object" ? "" + value : value
}

/**
 * 是否有某个属性
 */
export function hasProp(target: Object, prop: PropertyKey): boolean {
    return objectPrototype.hasOwnProperty.call(target, prop)
}

// From Immer utils
/**
 * 返回对象各个键的装饰器
 */
export const getOwnPropertyDescriptors =
    Object.getOwnPropertyDescriptors ||
    function getOwnPropertyDescriptors(target: any) {
        // Polyfill needed for Hermes and IE, see https://github.com/facebook/hermes/issues/274
        const res: any = {}
        // Note: without polyfill for ownKeys, symbols won't be picked up
        ownKeys(target).forEach(key => {
            res[key] = getDescriptor(target, key)
        })
        return res
    }
