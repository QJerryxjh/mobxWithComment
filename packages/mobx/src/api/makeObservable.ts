import {
    $mobx,
    asObservableObject,
    AnnotationsMap,
    endBatch,
    startBatch,
    CreateObservableOptions,
    ObservableObjectAdministration,
    collectStoredAnnotations,
    isPlainObject,
    isObservableObject,
    die,
    ownKeys,
    extendObservable,
    addHiddenProp,
    storedAnnotationsSymbol
} from "../internal"

// Hack based on https://github.com/Microsoft/TypeScript/issues/14829#issuecomment-322267089
// We need this, because otherwise, AdditionalKeys is going to be inferred to be any
// set of superfluous keys. But, we rather want to get a compile error unless AdditionalKeys is
// _explicity_ passed as generic argument
// Fixes: https://github.com/mobxjs/mobx/issues/2325#issuecomment-691070022
type NoInfer<T> = [T][T extends any ? 0 : never]

export function makeObservable<T extends object, AdditionalKeys extends PropertyKey = never>(
    target: T,
    annotations?: AnnotationsMap<T, NoInfer<AdditionalKeys>>,
    options?: CreateObservableOptions
): T {
    const adm: ObservableObjectAdministration = asObservableObject(target, options)[$mobx]
    startBatch()
    try {
        if (__DEV__ && annotations && target[storedAnnotationsSymbol]) {
            die(
                `makeObservable second arg must be nullish when using decorators. Mixing @decorator syntax with annotations is not supported.`
            )
        }
        // Default to decorators
        annotations ??= collectStoredAnnotations(target)

        // Annotate
        ownKeys(annotations).forEach(key => adm.make_(key, annotations![key]))
    } finally {
        endBatch()
    }
    return target
}

// proto[keysSymbol] = new Set<PropertyKey>()
const keysSymbol = Symbol("mobx-keys")

export function makeAutoObservable<T extends object, AdditionalKeys extends PropertyKey = never>(
    target: T,
    overrides?: AnnotationsMap<T, NoInfer<AdditionalKeys>>,
    options?: CreateObservableOptions
): T {
    if (__DEV__) {
        if (!isPlainObject(target) && !isPlainObject(Object.getPrototypeOf(target))) {
            die(`'makeAutoObservable' can only be used for classes that don't have a superclass`)
        }
        if (isObservableObject(target)) {
            die(`makeAutoObservable can only be used on objects not already made observable`)
        }
    }

    // Optimization: avoid visiting protos
    // Assumes that annotation.make_/.extend_ works the same for plain objects
    if (isPlainObject(target)) {
        return extendObservable(target, target, overrides, options)
    }

    // 为target创建adm管理器
    const adm: ObservableObjectAdministration = asObservableObject(target, options)[$mobx]

    // Optimization: cache keys on proto
    // Assumes makeAutoObservable can be called only once per object and can't be used in subclass
    if (!target[keysSymbol]) {
        // 如果target原型上没有[keysSymbol]属性,则为其原型上增加此属性,值为target及其原型上排除[$mobx]和constructor的键集合
        const proto = Object.getPrototypeOf(target)
        const keys = new Set([...ownKeys(target), ...ownKeys(proto)])
        keys.delete("constructor")
        keys.delete($mobx)
        addHiddenProp(proto, keysSymbol, keys)
    }

    startBatch()
    try {
        target[keysSymbol].forEach(key =>
            // 为target上的key添加注解
            adm.make_(
                key,
                // must pass "undefined" for { key: undefined }
                !overrides ? true : key in overrides ? overrides[key] : true
            )
        )
    } finally {
        endBatch()
    }
    return target
}
